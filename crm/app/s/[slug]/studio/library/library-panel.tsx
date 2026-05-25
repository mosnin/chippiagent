'use client';

/**
 * LibraryPanel — /s/[slug]/studio/library. A gallery of the realtor's past
 * Studio generations, newest first.
 *
 * Paginated 60-at-a-time. Each tile has a delete affordance — Studio is where
 * the asset was made, so Studio is where the realtor curates it. Videos show
 * a poster (the metadata frame) with a play overlay; clicking opens in a new
 * tab so the native controls bar never eats the thumbnail.
 */

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { ImagePlus, Trash2, Play } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { BODY_MUTED, CAPTION } from '@/lib/typography';

interface LibraryItem {
  id: string;
  kind: string;
  model: string;
  prompt: string;
  fileId: string;
  createdAt: string;
  url: string | null;
}

interface LibraryResponse {
  items: LibraryItem[];
  nextOffset: number | null;
}

export function LibraryPanel() {
  const [items, setItems] = useState<LibraryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [nextOffset, setNextOffset] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const loadPage = useCallback(async (offset: number): Promise<LibraryResponse> => {
    const res = await fetch(`/api/studio/library?offset=${offset}`);
    if (!res.ok) throw new Error('load failed');
    return (await res.json()) as LibraryResponse;
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await loadPage(0);
        if (!cancelled) {
          setItems(data.items);
          setNextOffset(data.nextOffset);
        }
      } catch {
        if (!cancelled) setError('Could not load your library.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [loadPage]);

  async function handleLoadMore() {
    if (nextOffset === null || loadingMore) return;
    setLoadingMore(true);
    setError(null);
    try {
      const data = await loadPage(nextOffset);
      setItems((prev) => [...prev, ...data.items]);
      setNextOffset(data.nextOffset);
    } catch {
      setError('Could not load more.');
    } finally {
      setLoadingMore(false);
    }
  }

  async function handleDelete(fileId: string) {
    if (deletingId) return;
    if (!window.confirm('Delete this asset? This cannot be undone.')) return;
    setDeletingId(fileId);
    setError(null);
    try {
      const res = await fetch(`/api/files/${fileId}`, { method: 'DELETE' });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error || 'Could not delete.');
      }
      setItems((prev) => prev.filter((i) => i.fileId !== fileId));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not delete.');
    } finally {
      setDeletingId(null);
    }
  }

  if (loading) {
    return <p className={cn(BODY_MUTED, 'py-12 text-center')}>Loading…</p>;
  }
  if (error && items.length === 0) {
    return (
      <p className="py-12 text-center text-[12.5px] text-rose-700 dark:text-rose-400">
        {error}
      </p>
    );
  }
  if (items.length === 0) {
    return (
      <EmptyState
        icon={ImagePlus}
        title="Nothing in your library yet."
        description="Images and video you generate in Studio collect here."
      />
    );
  }

  return (
    <div className="space-y-4">
      {error && (
        <p className="text-[12.5px] text-rose-700 dark:text-rose-400 text-center">
          {error}
        </p>
      )}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {items.map((item) => (
          <div
            key={item.id}
            className="group relative rounded-xl border border-border/60 bg-card overflow-hidden"
          >
            <div className="aspect-square bg-muted/30 relative">
              {item.url ? (
                item.kind === 'video' ? (
                  <a
                    href={item.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block w-full h-full"
                    aria-label={item.prompt || 'Open video'}
                  >
                    <video
                      src={item.url}
                      muted
                      playsInline
                      preload="metadata"
                      className="w-full h-full object-cover pointer-events-none"
                    />
                    <span className="absolute inset-0 flex items-center justify-center bg-black/20">
                      <Play className="w-8 h-8 text-white drop-shadow-md" fill="currentColor" />
                    </span>
                  </a>
                ) : (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={item.url}
                    alt={item.prompt || 'Generated asset'}
                    className="w-full h-full object-cover"
                  />
                )
              ) : null}
              <button
                type="button"
                onClick={() => void handleDelete(item.fileId)}
                disabled={deletingId === item.fileId}
                aria-label="Delete asset"
                title="Delete"
                className="absolute top-1.5 right-1.5 w-7 h-7 rounded-full bg-black/55 text-white opacity-0 group-hover:opacity-100 focus-visible:opacity-100 hover:bg-black/70 transition-opacity disabled:opacity-50 flex items-center justify-center"
              >
                <Trash2 size={13} />
              </button>
            </div>
            <div className="px-2.5 py-2 space-y-1.5">
              {item.prompt && (
                <p className={cn(CAPTION, 'line-clamp-2')} title={item.prompt}>
                  {item.prompt}
                </p>
              )}
              <Link
                href={`../schedule?fileId=${item.fileId}`}
                className="inline-block text-[11.5px] font-medium text-foreground hover:underline underline-offset-2"
              >
                Schedule →
              </Link>
            </div>
          </div>
        ))}
      </div>
      {nextOffset !== null && (
        <div className="flex justify-center pt-2">
          <Button onClick={() => void handleLoadMore()} disabled={loadingMore}>
            {loadingMore ? 'Loading…' : 'Load more'}
          </Button>
        </div>
      )}
    </div>
  );
}
