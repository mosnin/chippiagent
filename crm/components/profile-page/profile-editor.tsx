'use client';

/**
 * Editor for the realtor's public "link in bio" page (/p/[slug]).
 *
 * Reads and writes the ProfilePage row through /api/profile-page. The
 * realtor's photo, logo, accent colour, and light/dark theme aren't here
 * — those are inherited from the workspace branding, so the public page,
 * the application, and the booking page all stay visually identical. This
 * screen owns the page-specific bits: live toggle, headline, which
 * sections show, featured YouTube videos, and the custom links.
 */

import { useEffect, useRef, useState } from 'react';
import {
  Loader2,
  CheckCircle2,
  Plus,
  Trash2,
  ArrowUpRight,
  Copy,
  Check,
  ImagePlus,
  Play,
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { parseYouTubeId, youTubeThumbnail } from '@/lib/profile-page';
import { BODY_MUTED, CAPTION, PRIMARY_PILL } from '@/lib/typography';

interface CustomLink {
  id: string;
  label: string;
  url: string;
  thumbnail: string;
}

interface VideoItem {
  id: string;
  url: string;
  title: string;
}

const MAX_LINKS = 20;
const MAX_VIDEOS = 12;

function newId(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return `id-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function ProfileEditor({ slug }: { slug: string }) {
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  const [enabled, setEnabled] = useState(true);
  const [headline, setHeadline] = useState('');
  const [showIntake, setShowIntake] = useState(true);
  const [showTours, setShowTours] = useState(true);
  const [showProperties, setShowProperties] = useState(true);
  const [customLinks, setCustomLinks] = useState<CustomLink[]>([]);
  const [videos, setVideos] = useState<VideoItem[]>([]);

  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [copied, setCopied] = useState(false);

  const [origin, setOrigin] = useState('');
  useEffect(() => {
    setOrigin(window.location.origin);
  }, []);

  // Initial config load.
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const res = await fetch('/api/profile-page');
        if (!res.ok) throw new Error('load failed');
        const data = await res.json();
        if (!active) return;
        applyConfig(data);
      } catch {
        if (active) setLoadError(true);
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  function applyConfig(data: Record<string, unknown>) {
    setEnabled(data.enabled !== false);
    setHeadline(typeof data.headline === 'string' ? data.headline : '');
    setShowIntake(data.showIntake !== false);
    setShowTours(data.showTours !== false);
    setShowProperties(data.showProperties !== false);
    setCustomLinks(
      Array.isArray(data.customLinks)
        ? (data.customLinks as Partial<CustomLink>[]).map((l) => ({
            id: typeof l.id === 'string' && l.id ? l.id : newId(),
            label: typeof l.label === 'string' ? l.label : '',
            url: typeof l.url === 'string' ? l.url : '',
            thumbnail: typeof l.thumbnail === 'string' ? l.thumbnail : '',
          }))
        : [],
    );
    setVideos(
      Array.isArray(data.videos)
        ? (data.videos as Partial<VideoItem>[]).map((v) => ({
            id: typeof v.id === 'string' && v.id ? v.id : newId(),
            url: typeof v.url === 'string' ? v.url : '',
            title: typeof v.title === 'string' ? v.title : '',
          }))
        : [],
    );
  }

  function updateLink(id: string, patch: Partial<CustomLink>) {
    setCustomLinks((links) => links.map((l) => (l.id === id ? { ...l, ...patch } : l)));
  }
  function removeLink(id: string) {
    setCustomLinks((links) => links.filter((l) => l.id !== id));
  }
  function addLink() {
    setCustomLinks((links) =>
      links.length >= MAX_LINKS
        ? links
        : [...links, { id: newId(), label: '', url: '', thumbnail: '' }],
    );
  }

  function updateVideo(id: string, patch: Partial<VideoItem>) {
    setVideos((vs) => vs.map((v) => (v.id === id ? { ...v, ...patch } : v)));
  }
  function removeVideo(id: string) {
    setVideos((vs) => vs.filter((v) => v.id !== id));
  }
  function addVideo() {
    setVideos((vs) =>
      vs.length >= MAX_VIDEOS ? vs : [...vs, { id: newId(), url: '', title: '' }],
    );
  }

  const publicUrl = origin ? `${origin}/p/${slug}` : `/p/${slug}`;

  async function copyUrl() {
    try {
      await navigator.clipboard.writeText(publicUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      /* clipboard unavailable — the visible URL is still selectable */
    }
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaveError('');

    const cleanedLinks = customLinks
      .map((l) => ({ ...l, label: l.label.trim(), url: l.url.trim() }))
      .filter((l) => l.label || l.url);
    if (cleanedLinks.some((l) => !l.label || !/^https?:\/\//i.test(l.url))) {
      setSaveError(
        'Each link needs a label and a URL that starts with http:// or https://.',
      );
      return;
    }

    const cleanedVideos = videos
      .map((v) => ({ ...v, url: v.url.trim(), title: v.title.trim() }))
      .filter((v) => v.url || v.title);
    if (cleanedVideos.some((v) => !parseYouTubeId(v.url))) {
      setSaveError('Each video needs a valid YouTube link.');
      return;
    }

    setSaving(true);
    try {
      const res = await fetch('/api/profile-page', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          enabled,
          headline: headline.trim() || null,
          showIntake,
          showTours,
          showProperties,
          customLinks: cleanedLinks,
          videos: cleanedVideos,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setSaveError(data.error || "Couldn't save. Try again.");
        return;
      }
      const data = await res.json();
      applyConfig(data);
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch {
      setSaveError('Network hiccup. Try again.');
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="h-24 animate-pulse rounded-xl bg-muted" />
        <div className="h-40 animate-pulse rounded-xl bg-muted" />
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="rounded-xl border border-dashed border-border/70 bg-muted/20 px-5 py-10 text-center">
        <p className="text-sm text-foreground">Couldn&apos;t load your page.</p>
        <p className={cn(CAPTION, 'mt-1')}>Usually temporary — refresh to try again.</p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSave} className="space-y-12">
      {/* ── Share ──────────────────────────────────────────────────────── */}
      <section className="space-y-4">
        <header className="space-y-1">
          <h2 className="text-base font-semibold">Your link</h2>
          <p className={BODY_MUTED}>
            Put this one link in your Instagram bio, email signature, or
            anywhere a lead might find you.
          </p>
        </header>

        <div className="flex flex-wrap items-center gap-2">
          <code className="min-w-0 flex-1 truncate rounded-md border border-border/70 bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
            {publicUrl}
          </code>
          <button
            type="button"
            onClick={copyUrl}
            className="inline-flex items-center gap-1.5 rounded-md border border-border/70 bg-card px-3 py-2 text-xs font-medium transition-colors hover:bg-muted/40"
          >
            {copied ? (
              <>
                <Check size={13} className="text-foreground" />
                Copied
              </>
            ) : (
              <>
                <Copy size={13} />
                Copy
              </>
            )}
          </button>
          <a
            href={`/p/${slug}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 rounded-md border border-border/70 bg-card px-3 py-2 text-xs font-medium transition-colors hover:bg-muted/40"
          >
            View page
            <ArrowUpRight size={13} />
          </a>
        </div>

        <div className="flex items-start gap-3 pt-1">
          <Switch id="enabled" checked={enabled} onCheckedChange={setEnabled} />
          <div className="space-y-0.5">
            <Label
              htmlFor="enabled"
              className="cursor-pointer text-[12.5px] font-medium text-foreground"
            >
              Page is live
            </Label>
            <p className={CAPTION}>
              {enabled
                ? 'Anyone with the link can see it.'
                : 'Turned off — the link shows a "not found" page until you publish.'}
            </p>
          </div>
        </div>
      </section>

      {/* ── Headline ───────────────────────────────────────────────────── */}
      <section className="space-y-4 border-t border-border/60 pt-10">
        <header className="space-y-1">
          <h2 className="text-base font-semibold">Headline</h2>
          <p className={BODY_MUTED}>
            One line under your name. Your photo, logo, accent colour, and
            light/dark theme are inherited from your{' '}
            <a
              href={`/s/${slug}/configure`}
              className="text-foreground underline underline-offset-2 hover:text-foreground/80"
            >
              page appearance
            </a>{' '}
            — set your brand once and every public page matches.
          </p>
        </header>
        <div className="space-y-1.5">
          <Label
            htmlFor="headline"
            className="text-[12.5px] font-medium text-foreground"
          >
            Headline
          </Label>
          <Input
            id="headline"
            value={headline}
            onChange={(e) => setHeadline(e.target.value)}
            placeholder="Helping families find home in Austin."
            maxLength={200}
          />
          <p className={CAPTION}>Optional. Up to 200 characters.</p>
        </div>
      </section>

      {/* ── Sections ───────────────────────────────────────────────────── */}
      <section className="space-y-4 border-t border-border/60 pt-10">
        <header className="space-y-1">
          <h2 className="text-base font-semibold">Sections</h2>
          <p className={BODY_MUTED}>What shows on the page, top to bottom.</p>
        </header>
        <div className="space-y-4">
          <ToggleRow
            id="showIntake"
            checked={showIntake}
            onChange={setShowIntake}
            label="Application"
            help="The button to start an application — your main way to capture a lead."
          />
          <ToggleRow
            id="showTours"
            checked={showTours}
            onChange={setShowTours}
            label="Book a tour"
            help="A link to your tour-booking page."
          />
          <ToggleRow
            id="showProperties"
            checked={showProperties}
            onChange={setShowProperties}
            label="Featured listings"
            help="Your six most recently updated active listings."
          />
        </div>
      </section>

      {/* ── Videos ─────────────────────────────────────────────────────── */}
      <section className="space-y-4 border-t border-border/60 pt-10">
        <header className="space-y-1">
          <h2 className="text-base font-semibold">Videos</h2>
          <p className={BODY_MUTED}>
            Paste a YouTube link — a property tour, a market update — and it
            shows as a playable thumbnail in a &ldquo;Watch&rdquo; section.
          </p>
        </header>

        {videos.length === 0 ? (
          <p className={CAPTION}>No videos yet.</p>
        ) : (
          <div className="space-y-3">
            {videos.map((video) => (
              <VideoRow
                key={video.id}
                video={video}
                onChange={(patch) => updateVideo(video.id, patch)}
                onRemove={() => removeVideo(video.id)}
              />
            ))}
          </div>
        )}

        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={addVideo}
          disabled={videos.length >= MAX_VIDEOS}
        >
          <Plus size={14} />
          Add video
        </Button>
        {videos.length >= MAX_VIDEOS && (
          <p className={CAPTION}>You&apos;ve reached the limit of {MAX_VIDEOS} videos.</p>
        )}
      </section>

      {/* ── Custom links ───────────────────────────────────────────────── */}
      <section className="space-y-4 border-t border-border/60 pt-10">
        <header className="space-y-1">
          <h2 className="text-base font-semibold">Custom links</h2>
          <p className={BODY_MUTED}>
            Anything else worth a tap — your website, a saved-search page, a
            review profile. Links show the site&apos;s icon automatically; add
            your own image to override it.
          </p>
        </header>

        {customLinks.length === 0 ? (
          <p className={CAPTION}>No custom links yet.</p>
        ) : (
          <div className="space-y-3">
            {customLinks.map((link) => (
              <LinkRow
                key={link.id}
                link={link}
                onChange={(patch) => updateLink(link.id, patch)}
                onRemove={() => removeLink(link.id)}
              />
            ))}
          </div>
        )}

        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={addLink}
          disabled={customLinks.length >= MAX_LINKS}
        >
          <Plus size={14} />
          Add link
        </Button>
        {customLinks.length >= MAX_LINKS && (
          <p className={CAPTION}>You&apos;ve reached the limit of {MAX_LINKS} links.</p>
        )}
      </section>

      {/* ── Save ───────────────────────────────────────────────────────── */}
      <div className="space-y-3 border-t border-border/60 pt-6">
        {saveError && <p className="text-sm text-destructive">{saveError}</p>}
        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={saving}
            className={cn(PRIMARY_PILL, 'disabled:cursor-not-allowed disabled:opacity-60')}
          >
            {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            {saving ? 'Saving' : 'Save changes'}
          </button>
          {saved && (
            <span className={cn('inline-flex items-center gap-1.5', BODY_MUTED)}>
              <CheckCircle2 size={14} className="text-foreground" />
              Saved
            </span>
          )}
        </div>
      </div>
    </form>
  );
}

function ToggleRow({
  id,
  checked,
  onChange,
  label,
  help,
}: {
  id: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  help: string;
}) {
  return (
    <div className="flex items-start gap-3">
      <Switch id={id} checked={checked} onCheckedChange={onChange} />
      <div className="space-y-0.5">
        <Label
          htmlFor={id}
          className="cursor-pointer text-[12.5px] font-medium text-foreground"
        >
          {label}
        </Label>
        <p className={CAPTION}>{help}</p>
      </div>
    </div>
  );
}

function VideoRow({
  video,
  onChange,
  onRemove,
}: {
  video: VideoItem;
  onChange: (patch: Partial<VideoItem>) => void;
  onRemove: () => void;
}) {
  const videoId = parseYouTubeId(video.url);
  const showError = video.url.trim().length > 0 && !videoId;

  return (
    <div className="space-y-1.5">
      <div className="flex items-start gap-2">
        <div className="flex h-[3.25rem] w-[3.25rem] shrink-0 items-center justify-center overflow-hidden rounded-md border border-border/70 bg-muted/30 text-muted-foreground">
          {videoId ? (
            <img
              src={youTubeThumbnail(videoId)}
              alt=""
              className="h-full w-full object-cover"
            />
          ) : (
            <Play size={16} />
          )}
        </div>

        <div className="flex-1 space-y-2">
          <Input
            value={video.url}
            onChange={(e) => onChange({ url: e.target.value })}
            placeholder="YouTube link"
            maxLength={500}
            inputMode="url"
            aria-label="YouTube link"
          />
          <Input
            value={video.title}
            onChange={(e) => onChange({ title: e.target.value })}
            placeholder="Title (optional)"
            maxLength={120}
            aria-label="Video title"
          />
        </div>

        <button
          type="button"
          onClick={onRemove}
          aria-label="Remove video"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-foreground/[0.04] hover:text-foreground"
        >
          <Trash2 size={15} />
        </button>
      </div>
      {showError && (
        <p className="pl-[3.75rem] text-xs text-destructive">
          That doesn&apos;t look like a YouTube link.
        </p>
      )}
    </div>
  );
}

function LinkRow({
  link,
  onChange,
  onRemove,
}: {
  link: CustomLink;
  onChange: (patch: Partial<CustomLink>) => void;
  onRemove: () => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ''; // let the realtor re-pick the same file
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      setUploadError('Image must be under 2MB.');
      return;
    }
    setUploadError('');
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('type', 'link-thumb');
      const res = await fetch('/api/upload', { method: 'POST', body: fd });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setUploadError(data.error || 'Upload failed.');
        return;
      }
      onChange({ thumbnail: data.url });
    } catch {
      setUploadError('Upload failed.');
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="space-y-1.5">
      <div className="flex items-start gap-2">
        {/* Thumbnail */}
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          aria-label={link.thumbnail ? 'Change link image' : 'Add link image'}
          className="flex h-[3.25rem] w-[3.25rem] shrink-0 items-center justify-center overflow-hidden rounded-md border border-border/70 bg-muted/30 text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground"
        >
          {uploading ? (
            <Loader2 size={16} className="animate-spin" />
          ) : link.thumbnail ? (
            <img src={link.thumbnail} alt="" className="h-full w-full object-cover" />
          ) : (
            <ImagePlus size={16} />
          )}
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          className="hidden"
          onChange={handleFile}
        />

        {/* Label + URL */}
        <div className="flex-1 space-y-2">
          <Input
            value={link.label}
            onChange={(e) => onChange({ label: e.target.value })}
            placeholder="Link label"
            maxLength={80}
            aria-label="Link label"
          />
          <Input
            value={link.url}
            onChange={(e) => onChange({ url: e.target.value })}
            placeholder="https://"
            maxLength={500}
            inputMode="url"
            aria-label="Link URL"
          />
        </div>

        {/* Remove */}
        <button
          type="button"
          onClick={onRemove}
          aria-label="Remove link"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-foreground/[0.04] hover:text-foreground"
        >
          <Trash2 size={15} />
        </button>
      </div>

      {(link.thumbnail || uploadError) && (
        <div className="flex items-center gap-3 pl-[3.75rem]">
          {link.thumbnail && (
            <button
              type="button"
              onClick={() => onChange({ thumbnail: '' })}
              className="text-xs text-muted-foreground transition-colors hover:text-foreground"
            >
              Remove image
            </button>
          )}
          {uploadError && <p className="text-xs text-destructive">{uploadError}</p>}
        </div>
      )}
    </div>
  );
}
