'use client';

import { useState, useEffect, useCallback } from 'react';
import { Plus, Trash2, CalendarDays, CalendarOff, Clock, Loader2, Repeat, MapPin } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

interface Override {
  id: string;
  date: string;
  isBlocked: boolean;
  startHour: number | null;
  endHour: number | null;
  label: string | null;
  recurrence: string;
  endDate: string | null;
  propertyProfileId: string | null;
}

interface PropertyProfile {
  id: string;
  name: string;
  address: string | null;
}

interface AvailabilityOverridesProps {
  slug: string;
  propertyProfiles?: PropertyProfile[];
}

const HOURS = Array.from({ length: 24 }, (_, i) => i);

const RECURRENCE_LABELS: Record<string, string> = {
  none: 'One-time',
  weekly: 'Every week',
  biweekly: 'Every 2 weeks',
  monthly: 'Monthly',
};

function formatHour(h: number): string {
  if (h === 0) return '12 AM';
  if (h === 12) return '12 PM';
  if (h === 24) return '12 AM';
  if (h < 12) return `${h} AM`;
  return `${h - 12} PM`;
}

function formatDateLabel(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00');
  return d.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
}

export function AvailabilityOverrides({ slug, propertyProfiles = [] }: AvailabilityOverridesProps) {
  const [overrides, setOverrides] = useState<Override[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [formDate, setFormDate] = useState('');
  const [formType, setFormType] = useState<'custom' | 'blocked'>('custom');
  const [formStart, setFormStart] = useState(9);
  const [formEnd, setFormEnd] = useState(17);
  const [formLabel, setFormLabel] = useState('');
  const [formRecurrence, setFormRecurrence] = useState('none');
  const [formEndDate, setFormEndDate] = useState('');
  const [formPropertyId, setFormPropertyId] = useState('');
  const [formError, setFormError] = useState<string | null>(null);

  const loadOverrides = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/tours/overrides?slug=${encodeURIComponent(slug)}`);
      if (res.ok) {
        setOverrides(await res.json());
      } else {
        setFormError('Failed to load schedule overrides');
      }
    } catch {
      setFormError('Network error loading overrides');
    } finally {
      setLoading(false);
    }
  }, [slug]);

  useEffect(() => { loadOverrides(); }, [loadOverrides]);

  async function handleSave() {
    if (!formDate) { setFormError('Pick a date'); return; }
    if (formType === 'custom' && formEnd <= formStart) { setFormError('End must be after start'); return; }

    setSaving(true);
    setFormError(null);
    try {
      const res = await fetch('/api/tours/overrides', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          slug,
          date: formDate,
          isBlocked: formType === 'blocked',
          startHour: formType === 'custom' ? formStart : null,
          endHour: formType === 'custom' ? formEnd : null,
          label: formLabel.trim() || null,
          recurrence: formRecurrence,
          endDate: formRecurrence !== 'none' && formEndDate ? formEndDate : null,
          propertyProfileId: formPropertyId || null,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to save');
      }
      const created = await res.json();
      setOverrides((prev) => {
        const filtered = prev.filter((o) => o.id !== created.id && o.date !== created.date);
        return [...filtered, created].sort((a, b) => a.date.localeCompare(b.date));
      });
      resetForm();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setSaving(false);
    }
  }

  function resetForm() {
    setShowForm(false);
    setFormDate('');
    setFormLabel('');
    setFormType('custom');
    setFormStart(9);
    setFormEnd(17);
    setFormRecurrence('none');
    setFormEndDate('');
    setFormPropertyId('');
    setFormError(null);
  }

  async function handleDelete(id: string) {
    setDeletingId(id);
    try {
      const res = await fetch(`/api/tours/overrides/${id}`, { method: 'DELETE' });
      if (res.ok) {
        setOverrides((prev) => prev.filter((o) => o.id !== id));
      } else {
        const data = await res.json().catch(() => ({}));
        setFormError(data.error || 'Failed to delete override');
      }
    } catch {
      setFormError('Network error. Please try again.');
    } finally {
      setDeletingId(null);
    }
  }

  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const minDate = tomorrow.toISOString().split('T')[0];

  const profileMap = new Map(propertyProfiles.map((p) => [p.id, p]));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold">Schedule Overrides</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Set custom hours, recurring schedules, or block days off. Overrides take priority over defaults.
          </p>
        </div>
        {!showForm && (
          <Button size="sm" variant="outline" onClick={() => setShowForm(true)} className="gap-1.5">
            <Plus size={14} />
            Add Override
          </Button>
        )}
      </div>

      {showForm && (
        <div className="rounded-xl border border-border bg-card p-4 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Start Date</label>
              <input
                type="date"
                value={formDate}
                min={minDate}
                onChange={(e) => setFormDate(e.target.value)}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/30"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Label (optional)</label>
              <input
                type="text"
                value={formLabel}
                onChange={(e) => setFormLabel(e.target.value)}
                placeholder="e.g. Saturday open house"
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/30"
              />
            </div>
          </div>

          {/* Type */}
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Type</label>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setFormType('custom')}
                className={cn(
                  'flex items-center gap-2 px-3 py-2 rounded-lg border text-xs font-medium transition-all',
                  formType === 'custom' ? 'border-primary bg-primary/10 text-primary' : 'border-border hover:border-primary/40'
                )}
              >
                <Clock size={13} /> Custom Hours
              </button>
              <button
                type="button"
                onClick={() => setFormType('blocked')}
                className={cn(
                  'flex items-center gap-2 px-3 py-2 rounded-lg border text-xs font-medium transition-all',
                  formType === 'blocked'
                    ? 'border-red-400 bg-red-50 text-red-700 dark:border-red-700 dark:bg-red-900/20 dark:text-red-300'
                    : 'border-border hover:border-red-300'
                )}
              >
                <CalendarOff size={13} /> Day Off
              </button>
            </div>
          </div>

          {formType === 'custom' && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Start</label>
                <select
                  value={formStart}
                  onChange={(e) => setFormStart(Number(e.target.value))}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/30"
                >
                  {HOURS.filter((h) => h < 23).map((h) => (
                    <option key={h} value={h}>{formatHour(h)}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">End</label>
                <select
                  value={formEnd}
                  onChange={(e) => setFormEnd(Number(e.target.value))}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/30"
                >
                  {HOURS.filter((h) => h > formStart).map((h) => (
                    <option key={h} value={h}>{formatHour(h)}</option>
                  ))}
                  <option value={24}>12 AM (midnight)</option>
                </select>
              </div>
            </div>
          )}

          {/* Recurrence */}
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Repeats</label>
            <div className="flex flex-wrap gap-2">
              {Object.entries(RECURRENCE_LABELS).map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setFormRecurrence(key)}
                  className={cn(
                    'flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium transition-all',
                    formRecurrence === key
                      ? 'border-primary bg-primary/10 text-primary'
                      : 'border-border hover:border-primary/40'
                  )}
                >
                  {key !== 'none' && <Repeat size={11} />}
                  {label}
                </button>
              ))}
            </div>
          </div>

          {formRecurrence !== 'none' && (
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Repeats Until (optional)</label>
              <input
                type="date"
                value={formEndDate}
                min={formDate || minDate}
                onChange={(e) => setFormEndDate(e.target.value)}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/30"
              />
              <p className="text-[10px] text-muted-foreground mt-1">Leave empty to repeat indefinitely</p>
            </div>
          )}

          {/* Property selector */}
          {propertyProfiles.length > 0 && (
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Property (optional)</label>
              <select
                value={formPropertyId}
                onChange={(e) => setFormPropertyId(e.target.value)}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/30"
              >
                <option value="">All properties (global)</option>
                {propertyProfiles.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}{p.address ? ` — ${p.address}` : ''}</option>
                ))}
              </select>
            </div>
          )}

          {formError && <p className="text-xs text-destructive">{formError}</p>}

          <div className="flex items-center gap-2 pt-1">
            <Button size="sm" onClick={handleSave} disabled={saving}>
              {saving ? <Loader2 size={14} className="animate-spin mr-1" /> : null}
              Save Override
            </Button>
            <Button size="sm" variant="ghost" onClick={resetForm}>Cancel</Button>
          </div>
        </div>
      )}

      {/* Overrides list */}
      {loading ? (
        <div className="flex justify-center py-8">
          <Loader2 size={20} className="animate-spin text-muted-foreground" />
        </div>
      ) : overrides.length === 0 ? (
        <div className="text-center py-10 text-muted-foreground space-y-2">
          <CalendarDays size={32} className="mx-auto opacity-30" />
          <p className="text-sm">No schedule overrides</p>
          <p className="text-xs">Your default weekly schedule applies to all upcoming dates.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {overrides.map((o) => {
            const profile = o.propertyProfileId ? profileMap.get(o.propertyProfileId) : null;
            return (
              <div
                key={o.id}
                className={cn(
                  'flex items-center justify-between rounded-lg border px-4 py-3',
                  o.isBlocked
                    ? 'border-red-200 bg-red-50/50 dark:border-red-800 dark:bg-red-900/10'
                    : 'border-border bg-card'
                )}
              >
                <div className="flex items-center gap-3">
                  <div className={cn(
                    'w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0',
                    o.isBlocked ? 'bg-red-100 dark:bg-red-900/30' : 'bg-primary/10'
                  )}>
                    {o.isBlocked
                      ? <CalendarOff size={15} className="text-red-600 dark:text-red-400" />
                      : <Clock size={15} className="text-primary" />
                    }
                  </div>
                  <div>
                    <p className="text-sm font-medium">
                      {formatDateLabel(o.date)}
                      {o.label && <span className="ml-2 text-xs text-muted-foreground font-normal">— {o.label}</span>}
                    </p>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5">
                      <p className="text-xs text-muted-foreground">
                        {o.isBlocked ? 'Unavailable' : `${formatHour(o.startHour!)} – ${formatHour(o.endHour!)}`}
                      </p>
                      {o.recurrence !== 'none' && (
                        <span className="flex items-center gap-1 text-[10px] text-primary font-medium">
                          <Repeat size={9} />
                          {RECURRENCE_LABELS[o.recurrence]}
                          {o.endDate && ` until ${formatDateLabel(o.endDate)}`}
                        </span>
                      )}
                      {profile && (
                        <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
                          <MapPin size={9} /> {profile.name}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                <button
                  onClick={() => handleDelete(o.id)}
                  disabled={deletingId === o.id}
                  className="w-7 h-7 flex items-center justify-center rounded-md hover:bg-muted text-muted-foreground hover:text-destructive transition-colors disabled:opacity-50"
                  title="Remove override"
                >
                  {deletingId === o.id ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
