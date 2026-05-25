'use client';

/**
 * EditPanel — the interactive surface of /s/[slug]/studio/edit.
 *
 * Upload an image, pick a polish tool (upscale, background removal,
 * restyle), apply it. The result is stored as a File row by the API route
 * and its cost is metered into usage.
 */

import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import Link from 'next/link';
import { Upload, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { CAPTION } from '@/lib/typography';
import { DURATION_BASE, EASE_OUT } from '@/lib/motion';
import { STUDIO_EDIT_TOOLS } from '@/lib/studio/models';
import { GeneratingState } from '@/components/studio/generating-state';

interface EditResult {
  url: string;
  fileId: string;
}

export function EditPanel() {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [tool, setTool] = useState<string>('upscale');
  const [prompt, setPrompt] = useState('');
  const [processing, setProcessing] = useState(false);
  const [result, setResult] = useState<EditResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Resume-on-mount. A refresh or nav while fal is transforming the image
  // would otherwise drop the realtor's result on the floor.
  const processingRef = useRef(false);
  useEffect(() => {
    processingRef.current = processing;
  }, [processing]);
  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const tick = async () => {
      if (cancelled) return;
      try {
        const res = await fetch('/api/studio/recent-job?source=edit');
        if (!res.ok || cancelled) return;
        const data = (await res.json()) as {
          job: {
            id: string;
            status: 'running' | 'completed' | 'failed';
            fileId?: string;
            url?: string;
            errorMessage?: string;
          } | null;
        };
        if (cancelled || !data.job) return;
        if (data.job.status === 'running') {
          setProcessing(true);
          timer = setTimeout(tick, 3000);
          return;
        }
        if (!processingRef.current) return;
        setProcessing(false);
        if (data.job.status === 'completed' && data.job.fileId && data.job.url) {
          setResult({ url: data.job.url, fileId: data.job.fileId });
        } else if (data.job.status === 'failed') {
          setError(data.job.errorMessage || 'The edit failed.');
        }
      } catch {
        if (!cancelled) timer = setTimeout(tick, 5000);
      }
    };
    tick();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, []);

  const needsPrompt = STUDIO_EDIT_TOOLS[tool]?.needsPrompt ?? false;
  const canApply =
    file !== null && !processing && (!needsPrompt || prompt.trim().length > 0);

  function pickFile(f: File | undefined) {
    if (!f) return;
    setFile(f);
    setResult(null);
    setError(null);
    setPreview((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return URL.createObjectURL(f);
    });
  }

  async function handleApply() {
    if (!file || processing) return;
    if (needsPrompt && prompt.trim().length === 0) return;
    setProcessing(true);
    setError(null);
    try {
      const form = new FormData();
      form.append('file', file);
      form.append('tool', tool);
      if (needsPrompt) form.append('prompt', prompt.trim());
      const res = await fetch('/api/studio/edit', { method: 'POST', body: form });
      const body = (await res.json().catch(() => ({}))) as {
        url?: string;
        fileId?: string;
        error?: string;
      };
      if (!res.ok || !body.url || !body.fileId) {
        throw new Error(body.error || 'The edit failed. Please try again.');
      }
      setResult({ url: body.url, fileId: body.fileId });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'The edit failed. Please try again.');
    } finally {
      setProcessing(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Source picker */}
      <div className="space-y-2">
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="w-full rounded-xl border border-dashed border-border/70 bg-muted/20 hover:bg-muted/30 hover:border-border transition-colors py-8 px-6 flex flex-col items-center text-center"
        >
          {preview ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={preview}
              alt="Selected"
              className="max-h-56 rounded-lg border border-border/60"
            />
          ) : (
            <>
              <Upload className="w-6 h-6 text-muted-foreground/60" />
              <p className="mt-2 text-sm text-foreground">Choose an image to edit</p>
              <p className={cn(CAPTION, 'mt-0.5')}>
                A listing photo, a headshot, anything you have made.
              </p>
            </>
          )}
        </button>
        {preview && (
          <p className={cn(CAPTION, 'text-center')}>
            Click the image to choose a different one.
          </p>
        )}
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            pickFile(e.target.files?.[0]);
            e.target.value = '';
          }}
        />
      </div>

      {/* Tool picker */}
      <div className="flex items-center gap-1 flex-wrap">
        {Object.entries(STUDIO_EDIT_TOOLS).map(([slug, t]) => {
          const active = slug === tool;
          return (
            <button
              key={slug}
              type="button"
              onClick={() => setTool(slug)}
              disabled={processing}
              className={cn(
                'rounded-full px-3 h-8 text-[12.5px] font-medium transition-colors disabled:opacity-50',
                active
                  ? 'bg-foreground text-background'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted/40',
              )}
            >
              {t.label}
            </button>
          );
        })}
      </div>

      {/* Instruction — only for tools that need one */}
      {needsPrompt && (
        <Textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="Describe the change — warm up the lighting, remove the parked car, make the sky blue…"
          aria-label="Describe the change"
          maxLength={2000}
          disabled={processing}
          className="min-h-[80px] resize-none"
        />
      )}

      <div className="flex justify-end">
        <Button onClick={() => void handleApply()} disabled={!canApply}>
          {processing ? 'Working…' : 'Apply'}
        </Button>
      </div>

      {/* Error */}
      {error && (
        <div className="rounded-lg border border-rose-500/30 bg-rose-50/70 dark:bg-rose-500/5 px-3 py-2 flex items-start gap-2 text-[12.5px] text-rose-700 dark:text-rose-400">
          <AlertCircle size={13} className="mt-0.5 flex-shrink-0" />
          <span>{error}</span>
          <button
            type="button"
            onClick={() => setError(null)}
            className="ml-auto text-rose-700/70 dark:text-rose-400/70 hover:text-rose-700 dark:hover:text-rose-400"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Result */}
      {processing ? (
        <GeneratingState
          title="Working on your image."
          subtitle="This usually takes a few seconds."
        />
      ) : result ? (
        <motion.div
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: DURATION_BASE, ease: EASE_OUT }}
          className="space-y-2"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={result.url}
            alt="Edited image"
            className="w-full rounded-xl border border-border/60"
          />
          <div className="flex items-center justify-between gap-3">
            <p className={CAPTION}>Saved to your files.</p>
            <Link
              href={`../schedule?fileId=${result.fileId}`}
              className="text-[12.5px] font-medium text-foreground hover:underline underline-offset-2"
            >
              Schedule a post →
            </Link>
          </div>
        </motion.div>
      ) : null}
    </div>
  );
}
