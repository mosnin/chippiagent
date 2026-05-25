'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { buildIntakeUrl } from '@/lib/intake';
import { Textarea } from '@/components/ui/textarea';
import { CheckCircle2, Loader2, User, Link2, Bell, AlertCircle, Image, Palette, Plus, Trash2, Upload, Eye, FileText, Video, Moon, ListChecks, Lock } from 'lucide-react';
import { toast } from 'sonner';
import { H1, TITLE_FONT } from '@/lib/typography';

interface ConfigureAccountFormProps {
  initialData: {
    name: string;
    email: string;
    phone: string;
    businessName: string;
    slug: string;
    intakePageTitle: string;
    intakePageIntro: string;
    notifications: boolean;
    logoUrl: string;
    realtorPhotoUrl: string;
    intakeAccentColor: string;
    intakeBorderRadius: 'rounded' | 'sharp';
    intakeFont: 'system' | 'serif' | 'mono';
    intakeFooterLinks: { label: string; url: string }[];
    bio: string;
    socialLinks: { instagram?: string; linkedin?: string; facebook?: string };
    // Visual
    intakeHeaderBgColor: string;
    intakeHeaderGradient: string;
    intakeDarkMode: boolean;
    intakeFaviconUrl: string;
    // Content
    intakeVideoUrl: string;
    intakeThankYouTitle: string;
    intakeThankYouMessage: string;
    intakeConfirmationEmail: string;
    intakeDisclaimerText: string;
    // Form fields
    intakeDisabledSteps: string[];
    intakeCustomQuestions: { id: string; label: string; placeholder?: string; required?: boolean }[];
  };
  slug: string;
}

function SectionHeader({
  icon: Icon,
  title,
  description,
}: {
  icon: typeof User;
  title: string;
  description: string;
}) {
  return (
    <div className="flex items-start gap-3 pb-4 border-b border-border mb-5">
      <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0 mt-0.5">
        <Icon size={15} className="text-primary" />
      </div>
      <div>
        <p className="text-sm font-semibold">{title}</p>
        <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
      </div>
    </div>
  );
}

export function ConfigureAccountForm({ initialData, slug }: ConfigureAccountFormProps) {
  const [name, setName] = useState(initialData.name);
  const [phone, setPhone] = useState(initialData.phone);
  const [businessName, setBusinessName] = useState(initialData.businessName);
  const [intakePageTitle, setIntakePageTitle] = useState(
    initialData.intakePageTitle || 'Rental Application'
  );
  const [intakePageIntro, setIntakePageIntro] = useState(
    initialData.intakePageIntro ||
      'Share a few details so I can review your rental fit faster.'
  );
  const [notifications, setNotifications] = useState(initialData.notifications);
  const [logoUrl, setLogoUrl] = useState(initialData.logoUrl || '');
  const [realtorPhotoUrl, setRealtorPhotoUrl] = useState(initialData.realtorPhotoUrl || '');
  const [intakeAccentColor, setIntakeAccentColor] = useState(initialData.intakeAccentColor || '#ff964f');
  const [intakeBorderRadius, setIntakeBorderRadius] = useState<'rounded' | 'sharp'>(initialData.intakeBorderRadius || 'rounded');
  const [intakeFont, setIntakeFont] = useState<'system' | 'serif' | 'mono'>(initialData.intakeFont || 'system');
  const [intakeFooterLinks, setIntakeFooterLinks] = useState<{ label: string; url: string }[]>(initialData.intakeFooterLinks || []);
  const [bio, setBio] = useState(initialData.bio || '');
  const [socialLinks, setSocialLinks] = useState<{ instagram?: string; linkedin?: string; facebook?: string }>(initialData.socialLinks || { instagram: '', linkedin: '', facebook: '' });
  // Visual
  const [intakeHeaderBgColor, setIntakeHeaderBgColor] = useState(initialData.intakeHeaderBgColor || '');
  const [intakeHeaderGradient, setIntakeHeaderGradient] = useState(initialData.intakeHeaderGradient || '');
  const [intakeDarkMode, setIntakeDarkMode] = useState(initialData.intakeDarkMode || false);
  const [intakeFaviconUrl, setIntakeFaviconUrl] = useState(initialData.intakeFaviconUrl || '');
  const [logoPreview, setLogoPreview] = useState(initialData.logoUrl || '');
  const [photoPreview, setPhotoPreview] = useState(initialData.realtorPhotoUrl || '');
  const [faviconPreview, setFaviconPreview] = useState(initialData.intakeFaviconUrl || '');
  const logoInputRef = useRef<HTMLInputElement>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);
  const faviconInputRef = useRef<HTMLInputElement>(null);

  // Content
  const [intakeVideoUrl, setIntakeVideoUrl] = useState(initialData.intakeVideoUrl || '');
  const [intakeThankYouTitle, setIntakeThankYouTitle] = useState(initialData.intakeThankYouTitle || '');
  const [intakeThankYouMessage, setIntakeThankYouMessage] = useState(initialData.intakeThankYouMessage || '');
  const [intakeConfirmationEmail, setIntakeConfirmationEmail] = useState(initialData.intakeConfirmationEmail || '');
  const [intakeDisclaimerText, setIntakeDisclaimerText] = useState(initialData.intakeDisclaimerText || '');

  // Form fields
  const [disabledSteps, setDisabledSteps] = useState<string[]>(initialData.intakeDisabledSteps || []);
  const [customQuestions, setCustomQuestions] = useState<{ id: string; label: string; placeholder?: string; required?: boolean }[]>(initialData.intakeCustomQuestions || []);

  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');

  async function handleUpload(file: File, type: 'logo' | 'photo' | 'favicon') {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('type', type);
    const res = await fetch('/api/upload', { method: 'POST', body: formData });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      toast.error(data.error || "Upload didn't go through. Try again.");
      return null;
    }
    const { url } = await res.json();
    return url;
  }

  async function handleLogoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) { toast.error('Keep it under 2MB.'); return; }
    setLogoPreview(URL.createObjectURL(file));
    const url = await handleUpload(file, 'logo');
    if (url) { setLogoUrl(url); setLogoPreview(url); }
    else { setLogoPreview(''); }
  }

  async function handlePhotoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) { toast.error('Keep it under 2MB.'); return; }
    setPhotoPreview(URL.createObjectURL(file));
    const url = await handleUpload(file, 'photo');
    if (url) { setRealtorPhotoUrl(url); setPhotoPreview(url); }
    else { setPhotoPreview(''); }
  }

  async function handleFaviconUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) { toast.error('Keep it under 2MB.'); return; }
    setFaviconPreview(URL.createObjectURL(file));
    const url = await handleUpload(file, 'favicon');
    if (url) { setIntakeFaviconUrl(url); setFaviconPreview(url); }
    else { setFaviconPreview(''); }
  }

  function getVideoEmbedUrl(url: string): string | null {
    if (!url) return null;
    // YouTube
    const ytMatch = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([\w-]+)/);
    if (ytMatch) return `https://www.youtube.com/embed/${ytMatch[1]}`;
    // Loom
    const loomMatch = url.match(/loom\.com\/share\/([\w-]+)/);
    if (loomMatch) return `https://www.loom.com/embed/${loomMatch[1]}`;
    return null;
  }

  // Slug is always locked here — workspace already exists
  const previewUrl = buildIntakeUrl(slug);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (saving) return;
    setSaving(true);
    setError('');
    setSaved(false);

    try {
      // Save profile
      const profileRes = await fetch('/api/onboarding', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'save_profile', name, phone, businessName }),
      });
      if (!profileRes.ok) {
        const d = await profileRes.json().catch(() => ({}));
        throw new Error(d.error || 'Failed to save profile.');
      }

      // Update space settings (create_space is idempotent when space exists)
      const spaceRes = await fetch('/api/onboarding', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'create_space',
          slug,
          intakePageTitle,
          intakePageIntro,
          businessName,
          logoUrl: logoUrl.trim() || null,
          realtorPhotoUrl: realtorPhotoUrl.trim() || null,
          intakeAccentColor,
          intakeBorderRadius,
          intakeFont,
          intakeFooterLinks,
          bio: bio.trim() || null,
          socialLinks,
          intakeHeaderBgColor: intakeHeaderBgColor || null,
          intakeHeaderGradient: intakeHeaderGradient || null,
          intakeDarkMode,
          intakeFaviconUrl: intakeFaviconUrl.trim() || null,
          intakeVideoUrl: intakeVideoUrl.trim() || null,
          intakeThankYouTitle: intakeThankYouTitle.trim() || null,
          intakeThankYouMessage: intakeThankYouMessage.trim() || null,
          intakeConfirmationEmail: intakeConfirmationEmail.trim() || null,
          intakeDisclaimerText: intakeDisclaimerText.trim() || null,
          intakeDisabledSteps: disabledSteps,
          intakeCustomQuestions: customQuestions,
        }),
      });
      if (!spaceRes.ok) {
        const d = await spaceRes.json().catch(() => ({}));
        throw new Error(d.error || 'Failed to update workspace settings.');
      }

      // Save notifications
      const notifRes = await fetch('/api/onboarding', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'save_notifications',
          emailNotifications: notifications,
          defaultSubmissionStatus: 'New',
        }),
      });
      if (!notifRes.ok) {
        const d = await notifRes.json().catch(() => ({}));
        throw new Error(d.error || 'Failed to save notification settings.');
      }

      // Ensure onboard=true (idempotent — safe to call even if already true)
      await fetch('/api/onboarding', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'complete' }),
      });

      setSaved(true);
      toast.success('Account configured.');
      setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "That tripped me up. Try again.";
      setError(msg);
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <header className="space-y-1.5 mb-6">
        <p className="text-sm text-muted-foreground">Configure.</p>
        <h1 className={H1} style={TITLE_FONT}>
          Your workspace
        </h1>
        <p className="text-sm text-muted-foreground">
          Profile, intake link, and notification preferences.
        </p>
      </header>

      {/* Section nav */}
      <div className="flex items-center gap-3 overflow-x-auto pb-1 mb-2">
        {[
          { id: 'profile', label: 'Profile', icon: User },
          { id: 'intake', label: 'Intake link', icon: Link2 },
          { id: 'branding', label: 'Branding', icon: Image },
          { id: 'form-design', label: 'Form Design', icon: Palette },
          { id: 'visual', label: 'Visual', icon: Eye },
          { id: 'content', label: 'Content', icon: FileText },
          { id: 'form-fields', label: 'Form Fields', icon: ListChecks },
          { id: 'notifications', label: 'Notifications', icon: Bell },
        ].map(({ id, label, icon: Icon }) => (
          <a
            key={id}
            href={`#section-${id}`}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground px-2.5 py-1.5 rounded-md border border-border hover:bg-muted transition-colors whitespace-nowrap"
          >
            <Icon size={12} />
            {label}
          </a>
        ))}
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* ── Profile ─────────────────────────────────────────── */}
        <section id="section-profile" className="rounded-xl border border-border bg-card px-5 py-5 scroll-mt-4">
          <SectionHeader
            icon={User}
            title="Your profile"
            description="This info appears on your intake page and in lead notifications."
          />
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="name">Full name</Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Alex Preston"
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="businessName">Business or brand name</Label>
              <Input
                id="businessName"
                value={businessName}
                onChange={(e) => setBusinessName(e.target.value)}
                placeholder="Preston Leasing"
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                value={initialData.email}
                disabled
                className="text-muted-foreground"
              />
              <p className="text-xs text-muted-foreground">
                Email is managed through your login provider and can&apos;t be changed here.
              </p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="phone">Phone number</Label>
              <Input
                id="phone"
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="(555) 123-4567"
                required
              />
            </div>
          </div>
        </section>

        {/* ── Intake link ──────────────────────────────────────── */}
        <section id="section-intake" className="rounded-xl border border-border bg-card px-5 py-5 scroll-mt-4">
          <SectionHeader
            icon={Link2}
            title="Intake link"
            description="The link renters fill out. Share it anywhere — leads flow straight into your CRM."
          />
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Your intake link</Label>
              <div className="rounded-lg border border-border bg-muted/40 px-3 py-2">
                <code className="text-xs break-all">{previewUrl}</code>
              </div>
              <p className="text-xs text-muted-foreground">
                Your link slug is fixed after creation.
              </p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="intakePageTitle">Page title</Label>
              <Input
                id="intakePageTitle"
                value={intakePageTitle}
                onChange={(e) => setIntakePageTitle(e.target.value)}
                placeholder="Rental Application"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="intakePageIntro">Intro line</Label>
              <Input
                id="intakePageIntro"
                value={intakePageIntro}
                onChange={(e) => setIntakePageIntro(e.target.value)}
                placeholder="Share a few details so I can review your rental fit faster."
              />
            </div>
            <div className="rounded-lg border border-border bg-muted/30 p-4 space-y-1">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Preview
              </p>
              <p className="font-semibold text-sm">
                {intakePageTitle || 'Rental Application'}
              </p>
              <p className="text-xs text-muted-foreground">
                {intakePageIntro || 'Your intro line here.'}
              </p>
            </div>
          </div>
        </section>

        {/* ── Branding ─────────────────────────────────────────── */}
        <section id="section-branding" className="rounded-xl border border-border bg-card px-5 py-5 scroll-mt-4">
          <SectionHeader
            icon={Image}
            title="Branding"
            description="Customize how your intake and tour booking pages look to prospects."
          />
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Logo</Label>
              <div
                className="relative flex items-center gap-4 rounded-lg border-2 border-dashed border-border p-4 hover:border-primary/50 transition-colors cursor-pointer"
                onClick={() => logoInputRef.current?.click()}
              >
                {logoPreview || logoUrl ? (
                  <img src={logoPreview || logoUrl} alt="Logo preview" className="h-10 object-contain" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                ) : (
                  <div className="w-10 h-10 rounded bg-muted flex items-center justify-center">
                    <Upload size={18} className="text-muted-foreground" />
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium">{logoUrl ? 'Change logo' : 'Upload logo'}</p>
                  <p className="text-xs text-muted-foreground">PNG, JPG, WebP, or SVG. Max 2MB.</p>
                </div>
              </div>
              <input ref={logoInputRef} type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" className="hidden" onChange={handleLogoUpload} />
              <p className="text-xs text-muted-foreground">Your company logo — displayed on intake and booking pages.</p>
            </div>
            <div className="space-y-1.5">
              <Label>Profile photo</Label>
              <div
                className="relative flex items-center gap-4 rounded-lg border-2 border-dashed border-border p-4 hover:border-primary/50 transition-colors cursor-pointer"
                onClick={() => photoInputRef.current?.click()}
              >
                {photoPreview || realtorPhotoUrl ? (
                  <img src={photoPreview || realtorPhotoUrl} alt="Photo preview" className="w-12 h-12 rounded-full object-cover ring-2 ring-border" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                ) : (
                  <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center">
                    <Upload size={18} className="text-muted-foreground" />
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium">{realtorPhotoUrl ? 'Change photo' : 'Upload photo'}</p>
                  <p className="text-xs text-muted-foreground">PNG, JPG, or WebP. Max 2MB.</p>
                </div>
              </div>
              <input ref={photoInputRef} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={handlePhotoUpload} />
              <p className="text-xs text-muted-foreground">Your professional headshot — shown on public pages alongside your name and phone number.</p>
            </div>
          </div>
        </section>

        {/* ── Form Design ───────────────────────────────────────── */}
        <section id="section-form-design" className="rounded-xl border border-border bg-card px-5 py-5 scroll-mt-4">
          <SectionHeader
            icon={Palette}
            title="Form Design"
            description="Customize the appearance of your intake form."
          />
          <div className="space-y-4">
            {/* Color Scheme */}
            <div className="space-y-1.5">
              <Label>Color scheme</Label>
              <div className="flex items-center gap-2">
                {[
                  { name: 'Orange', value: '#ff964f' },
                  { name: 'Teal', value: '#14b8a6' },
                  { name: 'Blue', value: '#3b82f6' },
                  { name: 'Purple', value: '#8b5cf6' },
                  { name: 'Rose', value: '#f43f5e' },
                  { name: 'Emerald', value: '#10b981' },
                ].map((color) => (
                  <button
                    key={color.value}
                    type="button"
                    title={color.name}
                    onClick={() => setIntakeAccentColor(color.value)}
                    className={`w-8 h-8 rounded-full border-2 transition-all ${
                      intakeAccentColor === color.value
                        ? 'border-foreground scale-110'
                        : 'border-transparent hover:border-muted-foreground/40'
                    }`}
                    style={{ backgroundColor: color.value }}
                  />
                ))}
              </div>
              <p className="text-xs text-muted-foreground">
                Accent color used for buttons and highlights on the intake form.
              </p>
            </div>

            {/* Border Radius */}
            <div className="space-y-1.5">
              <Label>Border radius</Label>
              <div className="flex items-center gap-2">
                {[
                  { label: 'Rounded', value: 'rounded' as const },
                  { label: 'Sharp', value: 'sharp' as const },
                ].map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setIntakeBorderRadius(option.value)}
                    className={`px-4 py-2 text-sm font-medium border transition-colors ${
                      option.value === 'rounded' ? 'rounded-xl' : 'rounded-none'
                    } ${
                      intakeBorderRadius === option.value
                        ? 'border-primary bg-primary/10 text-foreground'
                        : 'border-border bg-background text-muted-foreground hover:bg-muted'
                    }`}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">
                Controls the corner rounding of cards and inputs on the intake form.
              </p>
            </div>

            {/* Font */}
            <div className="space-y-1.5">
              <Label htmlFor="intakeFont">Font</Label>
              <select
                id="intakeFont"
                value={intakeFont}
                onChange={(e) => setIntakeFont(e.target.value as 'system' | 'serif' | 'mono')}
                className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                <option value="system">System (default)</option>
                <option value="serif">Serif</option>
                <option value="mono">Mono</option>
              </select>
              <p className="text-xs text-muted-foreground">
                Font family used on the intake form.
              </p>
            </div>

            {/* Bio */}
            <div className="space-y-1.5">
              <Label htmlFor="bio">Bio</Label>
              <Textarea
                id="bio"
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                placeholder="A short bio shown on your intake page..."
                rows={3}
              />
              <p className="text-xs text-muted-foreground">
                A brief description about you or your business, displayed on the intake page.
              </p>
            </div>

            {/* Social Links */}
            <div className="space-y-1.5">
              <Label>Social links</Label>
              <div className="space-y-2">
                <Input
                  value={socialLinks.instagram || ''}
                  onChange={(e) => setSocialLinks({ ...socialLinks, instagram: e.target.value })}
                  placeholder="Instagram URL"
                />
                <Input
                  value={socialLinks.linkedin || ''}
                  onChange={(e) => setSocialLinks({ ...socialLinks, linkedin: e.target.value })}
                  placeholder="LinkedIn URL"
                />
                <Input
                  value={socialLinks.facebook || ''}
                  onChange={(e) => setSocialLinks({ ...socialLinks, facebook: e.target.value })}
                  placeholder="Facebook URL"
                />
              </div>
              <p className="text-xs text-muted-foreground">
                Social media links displayed on the intake page.
              </p>
            </div>

            {/* Footer Links */}
            <div className="space-y-1.5">
              <Label>Footer links</Label>
              <div className="space-y-2">
                {intakeFooterLinks.map((link, index) => (
                  <div key={index} className="flex items-center gap-2">
                    <Input
                      value={link.label}
                      onChange={(e) => {
                        const updated = [...intakeFooterLinks];
                        updated[index] = { ...updated[index], label: e.target.value };
                        setIntakeFooterLinks(updated);
                      }}
                      placeholder="Label"
                      className="flex-1"
                    />
                    <Input
                      value={link.url}
                      onChange={(e) => {
                        const updated = [...intakeFooterLinks];
                        updated[index] = { ...updated[index], url: e.target.value };
                        setIntakeFooterLinks(updated);
                      }}
                      placeholder="https://..."
                      className="flex-1"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        setIntakeFooterLinks(intakeFooterLinks.filter((_, i) => i !== index));
                      }}
                      className="flex-shrink-0 w-8 h-8 flex items-center justify-center rounded-md border border-border text-muted-foreground hover:text-destructive hover:border-destructive/40 transition-colors"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))}
              </div>
              <button
                type="button"
                onClick={() => setIntakeFooterLinks([...intakeFooterLinks, { label: '', url: '' }])}
                className="inline-flex items-center gap-1.5 text-xs font-medium text-primary hover:text-primary/80 transition-colors mt-1"
              >
                <Plus size={14} />
                Add link
              </button>
              <p className="text-xs text-muted-foreground">
                Links shown in the footer of your intake form.
              </p>
            </div>
          </div>
        </section>

        {/* ── Visual ────────────────────────────────────────────── */}
        <section id="section-visual" className="rounded-xl border border-border bg-card px-5 py-5 scroll-mt-4">
          <SectionHeader
            icon={Eye}
            title="Visual"
            description="Customize the visual appearance of your intake page."
          />
          <div className="space-y-4">
            {/* Header Background */}
            <div className="space-y-2">
              <Label>Header background</Label>
              <div className="flex items-center gap-3">
                <input
                  type="color"
                  value={intakeHeaderBgColor || '#ffffff'}
                  onChange={(e) => { setIntakeHeaderBgColor(e.target.value); setIntakeHeaderGradient(''); }}
                  className="w-10 h-10 rounded-md border border-border cursor-pointer"
                />
                <span className="text-xs text-muted-foreground">Solid color</span>
              </div>
              <div className="flex items-center gap-2 mt-2">
                {[
                  { label: 'None', value: '' },
                  { label: 'Warm sunset', value: 'linear-gradient(135deg, #f97316, #ec4899)' },
                  { label: 'Cool ocean', value: 'linear-gradient(135deg, #06b6d4, #3b82f6)' },
                  { label: 'Forest', value: 'linear-gradient(135deg, #22c55e, #14b8a6)' },
                ].map((preset) => (
                  <button
                    key={preset.label}
                    type="button"
                    onClick={() => { setIntakeHeaderGradient(preset.value); if (preset.value) setIntakeHeaderBgColor(''); }}
                    className={`px-3 py-1.5 text-xs font-medium rounded-md border transition-colors ${
                      intakeHeaderGradient === preset.value
                        ? 'border-primary bg-primary/10 text-foreground'
                        : 'border-border bg-background text-muted-foreground hover:bg-muted'
                    }`}
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">Choose a solid color or gradient preset for the intake page header.</p>
            </div>

            {/* Dark Mode */}
            <div className="flex items-center justify-between py-3 border-t border-border">
              <div>
                <p className="text-sm font-medium">Dark mode</p>
                <p className="text-xs text-muted-foreground">Enable dark mode for the intake form</p>
              </div>
              <Switch checked={intakeDarkMode} onCheckedChange={setIntakeDarkMode} />
            </div>

            {/* Favicon Upload */}
            <div className="space-y-2">
              <Label>Favicon</Label>
              <p className="text-xs text-muted-foreground">Upload a favicon for your intake page (PNG, ICO, or SVG, max 2MB)</p>
              <div className="border-2 border-dashed border-border rounded-xl p-4 text-center hover:border-primary/50 transition-colors cursor-pointer w-fit" onClick={() => faviconInputRef.current?.click()}>
                {faviconPreview ? (
                  <img src={faviconPreview} alt="Favicon" className="h-8 mx-auto object-contain" />
                ) : (
                  <div className="space-y-1 px-4">
                    <Upload size={18} className="mx-auto text-muted-foreground" />
                    <p className="text-xs text-muted-foreground">Click to upload</p>
                  </div>
                )}
                <input ref={faviconInputRef} type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" className="hidden" onChange={handleFaviconUpload} />
              </div>
            </div>
          </div>
        </section>

        {/* ── Content ──────────────────────────────────────────── */}
        <section id="section-content" className="rounded-xl border border-border bg-card px-5 py-5 scroll-mt-4">
          <SectionHeader
            icon={FileText}
            title="Content"
            description="Customize messages and content shown to applicants."
          />
          <div className="space-y-4">
            {/* Welcome Video */}
            <div className="space-y-1.5">
              <Label htmlFor="intakeVideoUrl">Welcome video</Label>
              <Input
                id="intakeVideoUrl"
                value={intakeVideoUrl}
                onChange={(e) => setIntakeVideoUrl(e.target.value)}
                placeholder="Paste YouTube or Loom URL"
              />
              <p className="text-xs text-muted-foreground">
                Embed a welcome video at the top of your intake page.
              </p>
              {getVideoEmbedUrl(intakeVideoUrl) && (
                <div className="mt-2 rounded-lg overflow-hidden border border-border aspect-video">
                  <iframe
                    src={getVideoEmbedUrl(intakeVideoUrl)!}
                    className="w-full h-full"
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                    allowFullScreen
                  />
                </div>
              )}
            </div>

            {/* Thank You Title */}
            <div className="space-y-1.5">
              <Label htmlFor="intakeThankYouTitle">Thank you title</Label>
              <Input
                id="intakeThankYouTitle"
                value={intakeThankYouTitle}
                onChange={(e) => setIntakeThankYouTitle(e.target.value)}
                placeholder="Application received"
              />
              <p className="text-xs text-muted-foreground">
                Custom heading shown after a successful submission.
              </p>
            </div>

            {/* Thank You Message */}
            <div className="space-y-1.5">
              <Label htmlFor="intakeThankYouMessage">Thank you message</Label>
              <Textarea
                id="intakeThankYouMessage"
                value={intakeThankYouMessage}
                onChange={(e) => setIntakeThankYouMessage(e.target.value)}
                placeholder="Thank you for submitting your application. We'll be in touch soon!"
                rows={3}
              />
              <p className="text-xs text-muted-foreground">
                Custom message shown on the success page after submission.
              </p>
            </div>

            {/* Confirmation Email */}
            <div className="space-y-1.5">
              <Label htmlFor="intakeConfirmationEmail">Confirmation email</Label>
              <Textarea
                id="intakeConfirmationEmail"
                value={intakeConfirmationEmail}
                onChange={(e) => setIntakeConfirmationEmail(e.target.value)}
                placeholder="Hi! Thanks for applying. We've received your application and will review it shortly."
                rows={4}
              />
              <p className="text-xs text-muted-foreground">
                Custom email body sent to the applicant after they submit the form.
              </p>
            </div>

            {/* Terms / Disclaimer */}
            <div className="space-y-1.5">
              <Label htmlFor="intakeDisclaimerText">Terms / Disclaimer</Label>
              <Textarea
                id="intakeDisclaimerText"
                value={intakeDisclaimerText}
                onChange={(e) => setIntakeDisclaimerText(e.target.value)}
                placeholder="By submitting this form, you agree to our terms and conditions..."
                rows={3}
              />
              <p className="text-xs text-muted-foreground">
                Legal text displayed at the bottom of the intake form.
              </p>
            </div>
          </div>
        </section>

        {/* ── Form Fields ──────────────────────────────────────── */}
        <section id="section-form-fields" className="rounded-xl border border-border bg-card px-5 py-5 scroll-mt-4">
          <SectionHeader
            icon={ListChecks}
            title="Form Fields"
            description="Control which steps appear on your intake form and add custom questions."
          />
          <div className="space-y-6">
            {/* Step toggles */}
            <div className="space-y-1.5">
              <Label>Form steps</Label>
              <p className="text-xs text-muted-foreground mb-3">
                Toggle steps on or off. Disabled steps are hidden from the intake form.
              </p>
              <div className="space-y-0">
                {[
                  { id: 'property', label: 'Property Selection', locked: true },
                  { id: 'about', label: 'About You', locked: true },
                  { id: 'housing', label: 'Current Housing', locked: false },
                  { id: 'household', label: 'Household', locked: false },
                  { id: 'income', label: 'Income', locked: false },
                  { id: 'history', label: 'Rental History', locked: false },
                  { id: 'screening', label: 'Screening', locked: false },
                  { id: 'details', label: 'Additional Notes', locked: false },
                  { id: 'documents', label: 'Documents', locked: false },
                  { id: 'submit', label: 'Review & Submit', locked: true },
                ].map((step) => {
                  const isDisabled = disabledSteps.includes(step.id);
                  return (
                    <div
                      key={step.id}
                      className="flex items-center justify-between py-2.5 border-b border-border last:border-b-0"
                    >
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium">{step.label}</p>
                        {step.locked && (
                          <span className="inline-flex items-center gap-1 text-[10px] font-medium text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                            <Lock size={10} />
                            Required
                          </span>
                        )}
                      </div>
                      <Switch
                        checked={step.locked ? true : !isDisabled}
                        disabled={step.locked}
                        onCheckedChange={(checked) => {
                          if (step.locked) return;
                          if (checked) {
                            setDisabledSteps(disabledSteps.filter((s) => s !== step.id));
                          } else {
                            setDisabledSteps([...disabledSteps, step.id]);
                          }
                        }}
                      />
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Custom questions */}
            <div className="space-y-1.5">
              <Label>Custom questions</Label>
              <p className="text-xs text-muted-foreground mb-3">
                Add your own questions that appear at the end of the form.
              </p>
              <div className="space-y-3">
                {customQuestions.map((q, index) => (
                  <div key={q.id} className="rounded-lg border border-border bg-muted/20 p-3 space-y-2">
                    <div className="flex items-start gap-2">
                      <Input
                        value={q.label}
                        onChange={(e) => {
                          const updated = [...customQuestions];
                          updated[index] = { ...updated[index], label: e.target.value };
                          setCustomQuestions(updated);
                        }}
                        placeholder="Enter your question..."
                        className="flex-1"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          setCustomQuestions(customQuestions.filter((_, i) => i !== index));
                        }}
                        className="flex-shrink-0 w-8 h-8 flex items-center justify-center rounded-md border border-border text-muted-foreground hover:text-destructive hover:border-destructive/40 transition-colors"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                    <div className="flex items-center gap-3">
                      <Input
                        value={q.placeholder || ''}
                        onChange={(e) => {
                          const updated = [...customQuestions];
                          updated[index] = { ...updated[index], placeholder: e.target.value };
                          setCustomQuestions(updated);
                        }}
                        placeholder="Placeholder text (optional)"
                        className="flex-1 text-xs"
                      />
                      <div className="flex items-center gap-1.5 flex-shrink-0">
                        <span className="text-xs text-muted-foreground">Required</span>
                        <Switch
                          checked={q.required || false}
                          onCheckedChange={(checked) => {
                            const updated = [...customQuestions];
                            updated[index] = { ...updated[index], required: checked };
                            setCustomQuestions(updated);
                          }}
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              <button
                type="button"
                onClick={() =>
                  setCustomQuestions([
                    ...customQuestions,
                    { id: crypto.randomUUID(), label: '', required: false },
                  ])
                }
                className="inline-flex items-center gap-1.5 text-xs font-medium text-primary hover:text-primary/80 transition-colors mt-1"
              >
                <Plus size={14} />
                Add question
              </button>
            </div>
          </div>
        </section>

        {/* ── Notifications ────────────────────────────────────── */}
        <section id="section-notifications" className="rounded-xl border border-border bg-card px-5 py-5 scroll-mt-4">
          <SectionHeader
            icon={Bell}
            title="Notifications"
            description="Choose how you want to be notified when a new lead comes in."
          />
          <div>
            <div className="flex items-center justify-between py-3 border-b border-border">
              <div>
                <p className="text-sm font-medium">Email notifications</p>
                <p className="text-xs text-muted-foreground">
                  Get an email for each new submission
                </p>
              </div>
              <Switch checked={notifications} onCheckedChange={setNotifications} />
            </div>
            <div className="flex items-center justify-between py-3">
              <div>
                <p className="text-sm font-medium">Dashboard badge</p>
                <p className="text-xs text-muted-foreground">Unread count in the sidebar</p>
              </div>
              <Switch checked disabled />
            </div>
          </div>
        </section>

        {error && (
          <div className="flex items-start gap-2.5 rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3">
            <AlertCircle size={15} className="text-destructive flex-shrink-0 mt-0.5" />
            <p className="text-sm text-destructive">{error}</p>
          </div>
        )}

        <Button type="submit" size="lg" className="w-full" disabled={saving}>
          {saving ? (
            <>
              <Loader2 size={16} className="mr-2 animate-spin" />
              Saving
            </>
          ) : saved ? (
            <>
              <CheckCircle2 size={16} className="mr-2 text-green-500 dark:text-green-400" />
              Saved
            </>
          ) : (
            'Save changes'
          )}
        </Button>
      </form>
    </div>
  );
}
