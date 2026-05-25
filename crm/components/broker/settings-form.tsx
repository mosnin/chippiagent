'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, CheckCircle2, Upload, MessageCircle } from 'lucide-react';
import { toast } from 'sonner';
import { RichTextEditor } from '@/components/ui/rich-text-editor';
import { generatePrivacyPolicy } from '@/lib/privacy-policy-template';

interface SettingsFormProps {
  name: string;
  websiteUrl: string | null;
  logoUrl: string | null;
  joinCode: string | null;
  privacyPolicyHtml: string | null;
  isOwner: boolean;
}

export function BrokerageSettingsForm({
  name: initialName,
  websiteUrl: initialWebsite,
  logoUrl: initialLogo,
  joinCode,
  privacyPolicyHtml: initialPrivacyPolicy,
  isOwner,
}: SettingsFormProps) {
  const [name, setName] = useState(initialName);
  const [websiteUrl, setWebsiteUrl] = useState(initialWebsite ?? '');
  const [logoUrl, setLogoUrl] = useState(initialLogo ?? '');
  const [privacyPolicyHtml, setPrivacyPolicyHtml] = useState(initialPrivacyPolicy ?? '');
  const [logoUploading, setLogoUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!isOwner) return;
    setSaving(true);
    setSaved(false);

    try {
      const res = await fetch('/api/broker/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          websiteUrl: websiteUrl.trim() || null,
          logoUrl: logoUrl.trim() || null,
          privacyPolicyHtml: privacyPolicyHtml || null,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setSaved(true);
        toast.success('Settings saved');
        setTimeout(() => setSaved(false), 2000);
      } else {
        toast.error(data.error ?? 'Failed to save');
      }
    } catch {
      toast.error('Network error');
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="brokerage-name">Brokerage name</Label>
        <Input
          id="brokerage-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={120}
          required
          disabled={!isOwner}
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="website-url">Website URL</Label>
        <Input
          id="website-url"
          value={websiteUrl}
          onChange={(e) => setWebsiteUrl(e.target.value)}
          placeholder="https://example.com"
          maxLength={500}
          disabled={!isOwner}
        />
        <p className="text-xs text-muted-foreground">Optional. Shown on your brokerage profile.</p>
      </div>

      <div className="space-y-1.5">
        <Label>Logo</Label>
        <div
          className={`relative flex items-center gap-4 rounded-lg border-2 border-dashed border-border p-4 hover:border-primary/50 transition-colors ${isOwner ? 'cursor-pointer' : 'opacity-60'}`}
          onClick={() => isOwner && document.getElementById('broker-logo-upload')?.click()}
        >
          {logoUrl ? (
            <img src={logoUrl} alt="Logo preview" className="h-10 max-w-[120px] object-contain" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
          ) : (
            <div className="w-10 h-10 rounded bg-muted flex items-center justify-center">
              <Upload size={18} className="text-muted-foreground" />
            </div>
          )}
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium">{logoUrl ? 'Change logo' : 'Upload logo'}</p>
            <p className="text-xs text-muted-foreground">PNG, JPG, WebP, or SVG. Max 2MB.</p>
          </div>
          {logoUploading && <Loader2 size={16} className="animate-spin text-muted-foreground" />}
        </div>
        <input
          id="broker-logo-upload"
          type="file"
          accept="image/png,image/jpeg,image/webp,image/svg+xml"
          className="hidden"
          disabled={!isOwner}
          onChange={async (e) => {
            const file = e.target.files?.[0];
            if (!file) return;
            if (file.size > 2 * 1024 * 1024) { toast.error('File must be under 2MB'); return; }
            setLogoUploading(true);
            try {
              const formData = new FormData();
              formData.append('file', file);
              formData.append('type', 'logo');
              // Use onboarding upload endpoint — broker-only accounts may not have a Space
              const res = await fetch('/api/upload/onboarding', { method: 'POST', body: formData });
              const data = await res.json();
              if (res.ok && data.url) {
                setLogoUrl(data.url);
                toast.success('Logo uploaded');
              } else {
                toast.error(data.error || 'Upload failed');
              }
            } catch { toast.error('Upload failed'); }
            finally { setLogoUploading(false); }
          }}
        />
        <p className="text-xs text-muted-foreground">Optional. Displayed on invite pages and emails.</p>
      </div>

      {joinCode && (
        <div className="space-y-1.5">
          <Label>Join Code</Label>
          <div className="flex items-center gap-2">
            <Input
              value={joinCode}
              readOnly
              disabled
              className="font-mono tracking-widest"
            />
          </div>
          <p className="text-xs text-muted-foreground">
            Current invite code. Manage it in the Invite Code section below.
          </p>
        </div>
      )}

      {/* ── Privacy Policy ──────────────────────────────────────────── */}
      <div className="space-y-3 pt-2">
        <div className="flex items-center justify-between">
          <div>
            <Label>Privacy Policy</Label>
            <p className="text-xs text-muted-foreground mt-0.5">Displayed on intake pages for realtors under your brokerage.</p>
          </div>
          {isOwner && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                setPrivacyPolicyHtml(generatePrivacyPolicy(name, 'brokerage'));
                toast.success('Privacy policy template generated');
              }}
            >
              <MessageCircle size={14} className="mr-1.5" />
              Generate template
            </Button>
          )}
        </div>
        <RichTextEditor
          value={privacyPolicyHtml}
          onChange={setPrivacyPolicyHtml}
          placeholder="Enter your brokerage privacy policy here or click 'Generate template' to start..."
          disabled={!isOwner}
        />
        <p className="text-xs text-muted-foreground">
          You are responsible for ensuring this privacy policy complies with applicable laws in your jurisdiction.
        </p>
      </div>

      {/* ── Lead Distribution ─────────────────────────────────────────── */}
      {/* Lead distribution is handled manually via /broker/leads */}

      {isOwner && (
        <Button type="submit" size="sm" disabled={saving || !name.trim()}>
          {saving ? (
            <><Loader2 size={14} className="mr-1.5 animate-spin" /> Saving...</>
          ) : saved ? (
            <><CheckCircle2 size={14} className="mr-1.5" /> Saved</>
          ) : (
            'Save changes'
          )}
        </Button>
      )}

      {!isOwner && (
        <p className="text-xs text-muted-foreground">Only the brokerage owner or admins can edit these settings.</p>
      )}
    </form>
  );
}
