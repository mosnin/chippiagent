'use client';

import { useUser, UserButton } from '@clerk/nextjs';
import { useState, useEffect } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import {
  BODY_MUTED,
  CAPTION,
  PRIMARY_PILL,
} from '@/lib/typography';

interface ProfileSectionProps {
  slug: string;
}

/**
 * Profile fields shown on the realtor's intake page — name, photo, bio,
 * social. Folded inline into /settings; the dedicated /settings/profile
 * page was overhead. The privacy-policy rich text editor was cut: the
 * realtor side only consumes the policy URL, so the HTML editor was
 * persisting bytes nothing read.
 */
export function ProfileSection({ slug }: ProfileSectionProps) {
  const { user, isLoaded } = useUser();
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [bio, setBio] = useState('');
  const [socialLinks, setSocialLinks] = useState<{
    instagram?: string;
    linkedin?: string;
    facebook?: string;
  }>({ instagram: '', linkedin: '', facebook: '' });
  const [phone, setPhone] = useState('');
  const [businessName, setBusinessName] = useState('');
  const [realtorPhotoUrl, setRealtorPhotoUrl] = useState('');
  const [photoUploading, setPhotoUploading] = useState(false);
  const [initialized, setInitialized] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (isLoaded && user && !initialized) {
      setFirstName(user.firstName ?? '');
      setLastName(user.lastName ?? '');
      setInitialized(true);
    }
  }, [isLoaded, user, initialized]);

  useEffect(() => {
    if (!slug) return;
    fetch(`/api/spaces?slug=${encodeURIComponent(slug)}`)
      .then((r) => r.json())
      .then((data) => {
        const s = data.settings ?? data;
        setBio(s.bio ?? '');
        setSocialLinks(s.socialLinks ?? { instagram: '', linkedin: '', facebook: '' });
        setPhone(s.phoneNumber ?? '');
        setBusinessName(s.businessName ?? '');
        setRealtorPhotoUrl(s.realtorPhotoUrl ?? '');
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [slug]);

  if (!isLoaded || !initialized || loading) {
    return <div className="h-40 bg-foreground/[0.04] rounded-md animate-pulse" />;
  }

  if (!user) return null;

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      try {
        await user!.update({ firstName, lastName });
      } catch (clerkErr) {
        console.warn('[profile] Clerk user.update() failed:', clerkErr);
      }

      const res = await fetch('/api/spaces', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          slug,
          bio: bio.trim() || null,
          socialLinks,
          realtorPhotoUrl: realtorPhotoUrl.trim() || null,
          phoneNumber: phone,
          businessName,
        }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || 'Could not save.');
      }

      const profileRes = await fetch('/api/onboarding', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'save_profile',
          name: `${firstName} ${lastName}`.trim(),
          phone,
          businessName,
        }),
      });
      if (!profileRes.ok) {
        const d = await profileRes.json().catch(() => ({}));
        throw new Error(d.error || 'Could not save.');
      }

      setSaved(true);
      toast.success('Profile saved.');
      setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'That tripped me up. Try again.');
    } finally {
      setSaving(false);
    }
  }

  const initials =
    [user.firstName?.[0], user.lastName?.[0]].filter(Boolean).join('').toUpperCase() || 'U';

  return (
    <form onSubmit={handleSave} className="space-y-8">
      {/* Identity */}
      <div className="flex items-center gap-4">
        {realtorPhotoUrl ? (
          // Profile photo as displayed publicly
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={realtorPhotoUrl}
            alt=""
            className="h-14 w-14 rounded-full object-cover bg-foreground/[0.06]"
            onError={(e) => {
              (e.target as HTMLImageElement).style.display = 'none';
            }}
          />
        ) : user.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={user.imageUrl}
            alt=""
            className="h-14 w-14 rounded-full object-cover bg-foreground/[0.06]"
          />
        ) : (
          <div className="h-14 w-14 rounded-full bg-foreground/[0.06] flex items-center justify-center text-base font-medium text-foreground">
            {initials}
          </div>
        )}
        <div className="min-w-0">
          <button
            type="button"
            onClick={() => document.getElementById('photo-upload')?.click()}
            disabled={photoUploading}
            className="text-sm text-foreground hover:text-foreground/80 underline-offset-4 hover:underline transition-colors duration-150 disabled:opacity-60 inline-flex items-center gap-1.5"
          >
            {photoUploading ? 'Uploading' : realtorPhotoUrl ? 'Change photo' : 'Upload photo'}
            {photoUploading && <Loader2 size={13} className="animate-spin text-muted-foreground" />}
          </button>
          <p className={CAPTION}>PNG, JPG, or WebP. Max 2MB.</p>
        </div>
        <input
          id="photo-upload"
          type="file"
          accept="image/png,image/jpeg,image/webp"
          className="hidden"
          onChange={async (e) => {
            const file = e.target.files?.[0];
            if (!file) return;
            if (file.size > 2 * 1024 * 1024) {
              toast.error('Keep it under 2MB.');
              return;
            }
            setPhotoUploading(true);
            try {
              const formData = new FormData();
              formData.append('file', file);
              formData.append('type', 'photo');
              const res = await fetch('/api/upload', { method: 'POST', body: formData });
              const data = await res.json();
              if (res.ok && data.url) {
                setRealtorPhotoUrl(data.url);
                toast.success('Photo uploaded.');
              } else {
                toast.error(data.error || "Upload didn't go through. Try again.");
              }
            } catch {
              toast.error("Upload didn't go through. Try again.");
            } finally {
              setPhotoUploading(false);
            }
          }}
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label htmlFor="firstName" className="text-[12.5px] font-medium text-foreground">
            First name
          </Label>
          <Input id="firstName" value={firstName} onChange={(e) => setFirstName(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="lastName" className="text-[12.5px] font-medium text-foreground">
            Last name
          </Label>
          <Input id="lastName" value={lastName} onChange={(e) => setLastName(e.target.value)} />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="businessName" className="text-[12.5px] font-medium text-foreground">
          Business name
        </Label>
        <Input
          id="businessName"
          value={businessName}
          onChange={(e) => setBusinessName(e.target.value)}
          placeholder="Preston Leasing"
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="phone" className="text-[12.5px] font-medium text-foreground">
          Phone number
        </Label>
        <Input
          id="phone"
          type="tel"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder="(555) 123-4567"
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="bio" className="text-[12.5px] font-medium text-foreground">
          Bio
        </Label>
        <Textarea
          id="bio"
          value={bio}
          onChange={(e) => setBio(e.target.value)}
          placeholder="A short bio shown on your intake page."
          rows={3}
        />
      </div>

      <div className="space-y-2">
        <Label className="text-[12.5px] font-medium text-foreground">Social links</Label>
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

      {/* Account chrome — Clerk avatar + password, kept (auth-critical). */}
      <div className="space-y-2 pt-4 border-t border-border/60">
        <Label className="text-[12.5px] font-medium text-foreground">Account</Label>
        <div className="flex items-center gap-3">
          <UserButton />
          <p className={CAPTION}>Email, password, and connected accounts.</p>
        </div>
      </div>

      <div className="flex items-center gap-3 pt-1">
        <button
          type="submit"
          disabled={saving}
          className={cn(PRIMARY_PILL, 'disabled:opacity-60 disabled:cursor-not-allowed')}
        >
          {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
          {saving ? 'Saving' : saved ? 'Saved' : 'Save changes'}
        </button>
        {saved && <p className={BODY_MUTED}>Changes saved.</p>}
      </div>
    </form>
  );
}
