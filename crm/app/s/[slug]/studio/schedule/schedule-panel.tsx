'use client';

/**
 * SchedulePanel — /s/[slug]/studio/schedule.
 *
 * Queue a post: an image, a caption, the social platforms the realtor has
 * connected through Composio, and a time. Creates a StudioPost row. The
 * connected-platform list is whatever the realtor connected on the
 * Integrations tab — read from the same IntegrationConnection records.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Upload, AlertCircle, CalendarClock } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { EmptyState } from '@/components/ui/empty-state';
import { SECTION_LABEL, BODY_MUTED, CAPTION } from '@/lib/typography';

interface Platform {
  toolkit: string;
  name: string;
}
interface ScheduledPost {
  id: string;
  caption: string;
  platforms: string[];
  scheduledAt: string;
  status: string;
  createdAt: string;
}

function formatWhen(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short',
  });
}

/** Local "now" formatted for an <input type="datetime-local"> min attribute. */
function nowLocalForInput(): string {
  const d = new Date();
  d.setSeconds(0, 0);
  // Shift by the offset so toISOString() (which formats UTC) reads as local.
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

const STATUS_TONE: Record<string, string> = {
  scheduled: 'text-amber-700 bg-amber-50 dark:text-amber-400 dark:bg-amber-500/15',
  publishing: 'text-amber-700 bg-amber-50 dark:text-amber-400 dark:bg-amber-500/15',
  posted: 'text-emerald-700 bg-emerald-50 dark:text-emerald-400 dark:bg-emerald-500/15',
  failed: 'text-rose-700 bg-rose-50 dark:text-rose-400 dark:bg-rose-500/15',
  canceled: 'text-muted-foreground bg-muted',
};

export function SchedulePanel({
  slug,
  initialFileId,
}: {
  slug: string;
  initialFileId: string | null;
}) {
  const [loading, setLoading] = useState(true);
  const [platforms, setPlatforms] = useState<Platform[]>([]);
  const [posts, setPosts] = useState<ScheduledPost[]>([]);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [existingFileId, setExistingFileId] = useState<string | null>(null);
  const [caption, setCaption] = useState('');
  const [selected, setSelected] = useState<string[]>([]);
  const [when, setWhen] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [canceling, setCanceling] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch('/api/studio/schedule');
      if (!res.ok) throw new Error('load failed');
      const data = (await res.json()) as { platforms?: Platform[]; posts?: ScheduledPost[] };
      setPlatforms(data.platforms ?? []);
      setPosts(data.posts ?? []);
    } catch {
      setError('Could not load your scheduled posts.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // An asset handed off from Create / Edit / Library — pre-load it as the
  // post image so the realtor never has to re-upload.
  useEffect(() => {
    if (!initialFileId) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/files/${initialFileId}`);
        if (!res.ok) return;
        const data = (await res.json()) as { url?: string };
        if (!cancelled && data.url) {
          setExistingFileId(initialFileId);
          setPreview(data.url);
        }
      } catch {
        // ignore — the realtor can still upload manually
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [initialFileId]);

  function pickFile(f: File | undefined) {
    if (!f) return;
    setError(null);
    if (preview) URL.revokeObjectURL(preview);
    setExistingFileId(null);
    setFile(f);
    setPreview(URL.createObjectURL(f));
  }

  function togglePlatform(toolkit: string) {
    setSelected((prev) =>
      prev.includes(toolkit) ? prev.filter((t) => t !== toolkit) : [...prev, toolkit],
    );
  }

  async function handleSchedule() {
    if (submitting) return;
    if (!file && !existingFileId) return setError('Add an image for the post.');
    if (selected.length === 0) return setError('Pick at least one platform.');
    if (!when) return setError('Pick a date and time.');
    setSubmitting(true);
    setError(null);
    try {
      const form = new FormData();
      if (existingFileId) form.append('fileId', existingFileId);
      else if (file) form.append('file', file);
      form.append('caption', caption.trim());
      form.append('platforms', JSON.stringify(selected));
      form.append('scheduledAt', when);
      const res = await fetch('/api/studio/schedule', { method: 'POST', body: form });
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(body.error || 'Could not schedule the post.');
      if (preview) URL.revokeObjectURL(preview);
      setFile(null);
      setExistingFileId(null);
      setPreview(null);
      setCaption('');
      setSelected([]);
      setWhen('');
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not schedule the post.');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleCancel(id: string) {
    if (!window.confirm('Cancel this scheduled post?')) return;
    setCanceling(id);
    setError(null);
    try {
      const res = await fetch(`/api/studio/schedule?id=${encodeURIComponent(id)}`, {
        method: 'DELETE',
      });
      if (!res.ok) {
        const b = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(b.error || 'Could not cancel the post.');
      }
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not cancel the post.');
    } finally {
      setCanceling(null);
    }
  }

  const nameOf = (tk: string) => platforms.find((p) => p.toolkit === tk)?.name ?? tk;

  if (loading) {
    return <p className={cn(BODY_MUTED, 'py-12 text-center')}>Loading…</p>;
  }

  return (
    <div className="space-y-10">
      {/* Compose */}
      <section className="space-y-5">
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          className="w-full rounded-xl border border-dashed border-border/70 bg-muted/20 hover:bg-muted/30 hover:border-border transition-colors py-6 px-6 flex flex-col items-center text-center"
        >
          {preview ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={preview}
              alt="Post"
              className="max-h-52 rounded-lg border border-border/60"
            />
          ) : (
            <>
              <Upload className="w-6 h-6 text-muted-foreground/60" />
              <p className="mt-2 text-sm text-foreground">Add the post image</p>
              <p className={cn(CAPTION, 'mt-0.5')}>
                Something you made in Create or Compose.
              </p>
            </>
          )}
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            pickFile(e.target.files?.[0]);
            e.target.value = '';
          }}
        />

        <div className="space-y-1.5">
          <p className={SECTION_LABEL}>Caption</p>
          <Textarea
            value={caption}
            onChange={(e) => setCaption(e.target.value)}
            placeholder="Write the caption for this post…"
            maxLength={2200}
            className="min-h-[88px] resize-none"
          />
        </div>

        <div className="space-y-1.5">
          <p className={SECTION_LABEL}>Post to</p>
          {platforms.length === 0 ? (
            <p className={cn(CAPTION, 'leading-relaxed')}>
              No social accounts connected yet. Connect Instagram, Facebook, or
              LinkedIn in{' '}
              <Link
                href={`/s/${slug}/integrations`}
                className="text-foreground underline underline-offset-2"
              >
                Settings → Integrations
              </Link>
              , then come back.
            </p>
          ) : (
            <div className="flex items-center gap-1.5 flex-wrap">
              {platforms.map((p) => {
                const on = selected.includes(p.toolkit);
                return (
                  <button
                    key={p.toolkit}
                    type="button"
                    onClick={() => togglePlatform(p.toolkit)}
                    className={cn(
                      'rounded-full px-3 h-8 text-[12.5px] font-medium border transition-colors',
                      on
                        ? 'bg-foreground text-background border-foreground'
                        : 'border-border/70 text-muted-foreground hover:text-foreground hover:border-border',
                    )}
                  >
                    {p.name}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <div className="space-y-1.5">
          <p className={SECTION_LABEL}>When</p>
          <Input
            type="datetime-local"
            value={when}
            min={nowLocalForInput()}
            onChange={(e) => setWhen(e.target.value)}
            className="w-auto"
          />
        </div>

        {error && (
          <div className="rounded-lg border border-rose-500/30 bg-rose-50/70 dark:bg-rose-500/5 px-3 py-2 flex items-start gap-2 text-[12.5px] text-rose-700 dark:text-rose-400">
            <AlertCircle size={13} className="mt-0.5 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <Button
          onClick={() => void handleSchedule()}
          disabled={submitting || platforms.length === 0}
        >
          {submitting ? 'Scheduling…' : 'Schedule post'}
        </Button>
      </section>

      {/* Scheduled posts */}
      <section className="space-y-3">
        <p className={SECTION_LABEL}>Scheduled</p>
        {posts.length === 0 ? (
          <EmptyState
            icon={CalendarClock}
            title="Nothing scheduled yet."
            description="Posts you queue will line up here."
          />
        ) : (
          <ul className="divide-y divide-border/60">
            {posts.map((post) => (
              <li key={post.id} className="flex items-center gap-3 py-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-foreground truncate">
                    {post.caption || 'Untitled post'}
                  </p>
                  <p className={CAPTION}>
                    {formatWhen(post.scheduledAt)} · {post.platforms.map(nameOf).join(', ')}
                  </p>
                </div>
                {post.status === 'scheduled' && (
                  <button
                    type="button"
                    onClick={() => void handleCancel(post.id)}
                    disabled={canceling === post.id}
                    className="text-[12px] text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50 flex-shrink-0"
                  >
                    {canceling === post.id ? 'Canceling…' : 'Cancel'}
                  </button>
                )}
                <span
                  className={cn(
                    'inline-flex text-xs font-medium rounded-full px-2.5 py-0.5 capitalize flex-shrink-0',
                    STATUS_TONE[post.status] ?? STATUS_TONE.scheduled,
                  )}
                >
                  {post.status}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
