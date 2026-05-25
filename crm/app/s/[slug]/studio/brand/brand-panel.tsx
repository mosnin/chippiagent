'use client';

/**
 * BrandPanel — the interactive surface of /s/[slug]/studio/brand.
 *
 * The realtor's brand kit: palette, caption voice, social handles. Studio
 * folds the palette into image generations so output comes out on-brand;
 * the voice primes caption writing.
 */

import { useEffect, useState } from 'react';
import { Plus, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { SECTION_LABEL, BODY_MUTED, CAPTION } from '@/lib/typography';

interface BrandHandles {
  instagram?: string;
  facebook?: string;
  linkedin?: string;
}
interface BrandKit {
  colors: string[];
  voice: string;
  handles: BrandHandles;
}

export function BrandPanel() {
  const [kit, setKit] = useState<BrandKit>({ colors: [], voice: '', handles: {} });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/studio/brand');
        if (!res.ok) throw new Error('load failed');
        const data = (await res.json()) as BrandKit;
        if (!cancelled) {
          setKit({
            colors: data.colors ?? [],
            voice: data.voice ?? '',
            handles: data.handles ?? {},
          });
        }
      } catch {
        if (!cancelled) setError('Could not load your brand kit.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  function edit(next: Partial<BrandKit>) {
    setKit((p) => ({ ...p, ...next }));
    setSaved(false);
  }

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch('/api/studio/brand', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(kit),
      });
      if (!res.ok) {
        const b = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(b.error || 'Could not save.');
      }
      setSaved(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save.');
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <p className={cn(BODY_MUTED, 'py-12 text-center')}>Loading…</p>;
  }

  return (
    <div className="space-y-8">
      {/* Palette */}
      <section className="space-y-3">
        <div>
          <p className={SECTION_LABEL}>Palette</p>
          <p className={cn(CAPTION, 'mt-1')}>
            The colors Studio leans on when it generates for you.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {kit.colors.map((c, i) => (
            <div key={i} className="relative group">
              <input
                type="color"
                value={c}
                onChange={(e) => {
                  const colors = [...kit.colors];
                  colors[i] = e.target.value;
                  edit({ colors });
                }}
                aria-label={`Brand color ${i + 1}`}
                className="w-10 h-10 rounded-md border border-border/70 cursor-pointer bg-transparent"
              />
              <button
                type="button"
                onClick={() => edit({ colors: kit.colors.filter((_, j) => j !== i) })}
                aria-label="Remove color"
                className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-foreground text-background flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
              >
                <X size={9} />
              </button>
            </div>
          ))}
          {kit.colors.length < 8 && (
            <button
              type="button"
              onClick={() => edit({ colors: [...kit.colors, '#ff964f'] })}
              aria-label="Add color"
              className="w-10 h-10 rounded-md border border-dashed border-border/70 text-muted-foreground hover:text-foreground hover:border-border flex items-center justify-center transition-colors"
            >
              <Plus size={14} />
            </button>
          )}
        </div>
      </section>

      {/* Voice */}
      <section className="space-y-3">
        <div>
          <p className={SECTION_LABEL}>Voice</p>
          <p className={cn(CAPTION, 'mt-1')}>
            How your captions should sound — Chippi writes to this.
          </p>
        </div>
        <Textarea
          value={kit.voice}
          onChange={(e) => edit({ voice: e.target.value })}
          placeholder="Warm and confident. Local expertise without the hard sell. Short sentences."
          maxLength={1000}
          className="min-h-[88px] resize-none"
        />
      </section>

      {/* Handles */}
      <section className="space-y-3">
        <div>
          <p className={SECTION_LABEL}>Social handles</p>
          <p className={cn(CAPTION, 'mt-1')}>Where your posts go.</p>
        </div>
        <div className="grid sm:grid-cols-3 gap-3">
          {(['instagram', 'facebook', 'linkedin'] as const).map((k) => (
            <div key={k} className="space-y-1.5">
              <label htmlFor={`handle-${k}`} className="text-sm font-medium capitalize">
                {k}
              </label>
              <Input
                id={`handle-${k}`}
                value={kit.handles[k] ?? ''}
                onChange={(e) => edit({ handles: { ...kit.handles, [k]: e.target.value } })}
                placeholder="yourhandle"
              />
            </div>
          ))}
        </div>
      </section>

      {/* Save */}
      <div className="flex items-center gap-3 pt-2 border-t border-border/60">
        <Button onClick={() => void handleSave()} disabled={saving}>
          {saving ? 'Saving…' : 'Save brand kit'}
        </Button>
        {saved && !saving && <p className={CAPTION}>Saved.</p>}
        {error && <p className="text-[12.5px] text-rose-700 dark:text-rose-400">{error}</p>}
      </div>
    </div>
  );
}
