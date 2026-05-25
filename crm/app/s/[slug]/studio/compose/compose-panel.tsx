'use client';

/**
 * ComposePanel — /s/[slug]/studio/compose.
 *
 * A simple post composer: upload a photo, pick a real-estate template
 * (Just Listed, Open House, Just Sold), fill the text, and Studio renders a
 * finished, on-brand 1080² post onto a canvas. Text is drawn deterministically
 * — crisp and exact, never AI-guessed. Save drops the result into Files.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Upload, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { CAPTION } from '@/lib/typography';
import { COMPOSE_TEMPLATES, type ComposeColor } from '@/lib/studio/templates';

const CANVAS_SIZE = 1080;
const DEFAULT_ACCENT = '#ff964f';

function resolveColor(c: ComposeColor, accent: string): string {
  if (c === 'accent') return accent;
  if (c === 'dark') return '#0a0a0a';
  return '#ffffff';
}

function drawCover(ctx: CanvasRenderingContext2D, img: HTMLImageElement, size: number) {
  const scale = Math.max(size / img.width, size / img.height);
  const w = img.width * scale;
  const h = img.height * scale;
  ctx.drawImage(img, (size - w) / 2, (size - h) / 2, w, h);
}

export function ComposePanel() {
  const [photo, setPhoto] = useState<HTMLImageElement | null>(null);
  const [templateId, setTemplateId] = useState<string>(COMPOSE_TEMPLATES[0].id);
  const [values, setValues] = useState<Record<string, string>>({});
  const [accent, setAccent] = useState(DEFAULT_ACCENT);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const template = useMemo(
    () => COMPOSE_TEMPLATES.find((t) => t.id === templateId) ?? COMPOSE_TEMPLATES[0],
    [templateId],
  );

  // Pull the brand accent so posts come out on-brand.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/studio/brand');
        if (!res.ok) return;
        const data = (await res.json()) as { colors?: string[] };
        if (!cancelled && data.colors?.[0]) setAccent(data.colors[0]);
      } catch {
        // brand kit is optional — keep the default accent
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const redraw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.width = CANVAS_SIZE;
    canvas.height = CANVAS_SIZE;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.fillStyle = '#0a0a0a';
    ctx.fillRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);
    if (photo) drawCover(ctx, photo, CANVAS_SIZE);

    ctx.globalAlpha = template.band.opacity;
    ctx.fillStyle = resolveColor(template.band.color, accent);
    ctx.fillRect(0, template.band.y * CANVAS_SIZE, CANVAS_SIZE, CANVAS_SIZE);
    ctx.globalAlpha = 1;

    for (const layer of template.layers) {
      const raw = values[layer.key]?.trim() || layer.placeholder;
      const text = layer.uppercase ? raw.toUpperCase() : raw;
      ctx.fillStyle = resolveColor(layer.color, accent);
      ctx.font = `${layer.weight} ${layer.size * CANVAS_SIZE}px -apple-system, "SF Pro Text", system-ui, sans-serif`;
      ctx.textAlign = layer.align;
      ctx.textBaseline = 'middle';
      ctx.fillText(text, layer.x * CANVAS_SIZE, layer.y * CANVAS_SIZE);
    }
  }, [photo, template, values, accent]);

  useEffect(() => {
    redraw();
  }, [redraw]);

  function onPickPhoto(f: File | undefined) {
    if (!f) return;
    setError(null);
    setSaved(false);
    const img = new Image();
    img.onload = () => {
      setPhoto(img);
      URL.revokeObjectURL(img.src);
    };
    img.onerror = () => setError('Could not load that image.');
    img.src = URL.createObjectURL(f);
  }

  async function handleSave() {
    const canvas = canvasRef.current;
    if (!canvas || saving) return;
    setSaving(true);
    setError(null);
    try {
      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, 'image/png'),
      );
      if (!blob) throw new Error('Could not render the post.');
      const form = new FormData();
      form.append(
        'file',
        new File([blob], `studio-post-${Date.now()}.png`, { type: 'image/png' }),
      );
      const res = await fetch('/api/files', { method: 'POST', body: form });
      if (!res.ok) {
        const b = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(b.error || 'Could not save the post.');
      }
      setSaved(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save the post.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="grid gap-6 md:grid-cols-2">
      {/* Preview */}
      <div className="space-y-2">
        <canvas
          ref={canvasRef}
          width={CANVAS_SIZE}
          height={CANVAS_SIZE}
          aria-label="Post preview"
          className="w-full rounded-xl border border-border/60 bg-muted/30"
        />
        {!photo && (
          <p className={cn(CAPTION, 'text-center')}>
            Add a photo to see your post come together.
          </p>
        )}
      </div>

      {/* Controls */}
      <div className="space-y-6">
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          className="w-full rounded-xl border border-dashed border-border/70 bg-muted/20 hover:bg-muted/30 hover:border-border transition-colors py-5 px-6 flex items-center justify-center gap-2 text-sm text-foreground"
        >
          <Upload className="w-4 h-4 text-muted-foreground/70" />
          {photo ? 'Choose a different photo' : 'Choose a photo'}
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            onPickPhoto(e.target.files?.[0]);
            e.target.value = '';
          }}
        />

        {/* Template */}
        <div className="flex items-center gap-1 flex-wrap">
          {COMPOSE_TEMPLATES.map((t) => {
            const active = t.id === templateId;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => {
                  setTemplateId(t.id);
                  setSaved(false);
                }}
                className={cn(
                  'rounded-full px-3 h-8 text-[12.5px] font-medium transition-colors',
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

        {/* Fields */}
        <div className="space-y-3">
          {template.layers.map((layer) => (
            <div key={layer.key} className="space-y-1.5">
              <label htmlFor={`f-${layer.key}`} className="text-sm font-medium">
                {layer.label}
              </label>
              <Input
                id={`f-${layer.key}`}
                value={values[layer.key] ?? ''}
                onChange={(e) => {
                  const v = e.target.value;
                  setValues((p) => ({ ...p, [layer.key]: v }));
                  setSaved(false);
                }}
                placeholder={layer.placeholder}
                maxLength={120}
              />
            </div>
          ))}
        </div>

        {error && (
          <div className="rounded-lg border border-rose-500/30 bg-rose-50/70 dark:bg-rose-500/5 px-3 py-2 flex items-start gap-2 text-[12.5px] text-rose-700 dark:text-rose-400">
            <AlertCircle size={13} className="mt-0.5 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <div className="flex items-center gap-3 pt-2 border-t border-border/60">
          <Button onClick={() => void handleSave()} disabled={saving || !photo}>
            {saving ? 'Saving…' : 'Save to files'}
          </Button>
          {saved && !saving && <p className={CAPTION}>Saved to your files.</p>}
        </div>
      </div>
    </div>
  );
}
