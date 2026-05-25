'use client';

import { useState, useMemo, FormEvent } from 'react';
import Link from 'next/link';
import {
  ChevronLeft,
  ChevronRight,
  MapPin,
  Phone,
  Mail,
  Briefcase,
  Plus,
  X,
  StickyNote,
  CalendarPlus,
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { H1, H2, H3, TITLE_FONT, PRIMARY_PILL } from '@/lib/typography';
import { TourStatsStrip } from '@/components/tours/tour-stats-strip';
import { cn } from '@/lib/utils';

// ── Types ────────────────────────────────────────────────────────────────────

interface Tour {
  id: string;
  guestName: string;
  guestEmail: string | null;
  propertyAddress: string | null;
  startsAt: string;
  endsAt: string;
  status: string;
}

interface ContactFollowUp {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  followUpAt: string;
}

interface DealFollowUp {
  id: string;
  title: string;
  followUpAt: string;
}

interface CustomEvent {
  id: string;
  title: string;
  description: string | null;
  date: string;
  time: string | null;
  color: string;
}

type ViewMode = 'month' | 'week' | 'day';

interface CalendarNote {
  id: string;
  date: string;
  note: string;
}

interface TourStat {
  startsAt: string;
  status: string;
  sourceDealId: string | null;
  createdAt?: string;
}

interface CalendarViewProps {
  slug: string;
  tours: Tour[];
  /** Wider window of tours used to compute the stat strip. */
  tourStats: TourStat[];
  contactFollowUps: ContactFollowUp[];
  dealFollowUps: DealFollowUp[];
  customEvents: CustomEvent[];
  calendarNotes: CalendarNote[];
}

/** What's visible on the calendar grid. */
type LayerFilter = 'all' | 'tours' | 'followups';

type UrgencyLevel = 'overdue' | 'today' | 'soon' | 'upcoming';

function getUrgency(followUpAt: string): UrgencyLevel {
  const now = new Date();
  const due = new Date(followUpAt);
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const dueStart = new Date(due.getFullYear(), due.getMonth(), due.getDate());
  const diffDays = Math.round((dueStart.getTime() - todayStart.getTime()) / 86400000);
  if (diffDays < 0) return 'overdue';
  if (diffDays === 0) return 'today';
  if (diffDays <= 3) return 'soon';
  return 'upcoming';
}

const URGENCY_CHIP: Record<UrgencyLevel, { label: string; className: string }> = {
  overdue: { label: 'Overdue', className: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' },
  today:   { label: 'Today',   className: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400' },
  soon:    { label: 'Soon',    className: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400' },
  upcoming:{ label: 'Upcoming',className: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' },
};

// ── Helpers ──────────────────────────────────────────────────────────────────

function toDateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function parseDateKey(key: string): Date {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

function getMonday(d: Date): Date {
  const r = new Date(d);
  const day = r.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  r.setDate(r.getDate() + diff);
  return r;
}

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

const MONTH_NAMES_SHORT = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const DAY_NAMES_FULL = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const DAY_NAMES_WEEK = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

const COLOR_OPTIONS = [
  { value: 'gray', label: 'Gray', dot: 'bg-gray-500' },
  { value: 'orange', label: 'Orange', dot: 'bg-orange-500' },
  { value: 'blue', label: 'Blue', dot: 'bg-blue-500' },
  { value: 'purple', label: 'Purple', dot: 'bg-purple-500' },
  { value: 'green', label: 'Green', dot: 'bg-green-500' },
  { value: 'red', label: 'Red', dot: 'bg-red-500' },
] as const;

function colorToDotClass(color: string): string {
  const map: Record<string, string> = {
    gray: 'text-gray-500',
    orange: 'text-orange-500',
    blue: 'text-blue-500',
    purple: 'text-purple-500',
    green: 'text-green-500',
    red: 'text-red-500',
  };
  return map[color] ?? 'text-gray-500';
}

function colorToBgClass(color: string): string {
  const map: Record<string, string> = {
    gray: 'bg-gray-500',
    orange: 'bg-orange-500',
    blue: 'bg-blue-500',
    purple: 'bg-purple-500',
    green: 'bg-green-500',
    red: 'bg-red-500',
  };
  return map[color] ?? 'bg-gray-500';
}

// ── Component ────────────────────────────────────────────────────────────────

export function CalendarView({
  slug,
  tours: rawTours,
  tourStats,
  contactFollowUps: rawContactFollowUps,
  dealFollowUps: rawDealFollowUps,
  customEvents: initialCustomEvents,
  calendarNotes: initialCalendarNotes,
}: CalendarViewProps) {
  const [layer, setLayer] = useState<LayerFilter>('all');

  // Filter chip state. "Tours" hides follow-ups; "Follow-ups" hides tours.
  // Custom events + notes always show — they're the user's own annotations,
  // not a queryable layer.
  const tours = layer === 'followups' ? [] : rawTours;
  const contactFollowUps = layer === 'tours' ? [] : rawContactFollowUps;
  const dealFollowUps = layer === 'tours' ? [] : rawDealFollowUps;
  const today = new Date();
  const todayKey = toDateKey(today);

  const [view, setView] = useState<ViewMode>('month');
  const [currentMonth, setCurrentMonth] = useState(today.getMonth());
  const [currentYear, setCurrentYear] = useState(today.getFullYear());
  const [currentDate, setCurrentDate] = useState(today);
  const [selectedDate, setSelectedDate] = useState<string>(todayKey);
  const [customEvents, setCustomEvents] = useState<CustomEvent[]>(initialCustomEvents);
  const [calendarNotes, setCalendarNotes] = useState<CalendarNote[]>(initialCalendarNotes);
  const [showAddForm, setShowAddForm] = useState(false);
  const [showAddNote, setShowAddNote] = useState(false);
  const [noteText, setNoteText] = useState('');
  const [noteSubmitting, setNoteSubmitting] = useState(false);
  const [formSubmitting, setFormSubmitting] = useState(false);

  // Add-event form state
  const [formTitle, setFormTitle] = useState('');
  const [formDate, setFormDate] = useState(selectedDate);
  const [formTime, setFormTime] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [formColor, setFormColor] = useState('gray');

  // ── Lookup maps ──────────────────────────────────────────────────────────

  const toursByDate = useMemo(() => {
    const map = new Map<string, Tour[]>();
    for (const t of tours) {
      const key = toDateKey(new Date(t.startsAt));
      const arr = map.get(key) ?? [];
      arr.push(t);
      map.set(key, arr);
    }
    return map;
  }, [tours]);

  const contactsByDate = useMemo(() => {
    const map = new Map<string, ContactFollowUp[]>();
    for (const c of contactFollowUps) {
      const key = toDateKey(new Date(c.followUpAt));
      const arr = map.get(key) ?? [];
      arr.push(c);
      map.set(key, arr);
    }
    return map;
  }, [contactFollowUps]);

  const dealsByDate = useMemo(() => {
    const map = new Map<string, DealFollowUp[]>();
    for (const d of dealFollowUps) {
      const key = toDateKey(new Date(d.followUpAt));
      const arr = map.get(key) ?? [];
      arr.push(d);
      map.set(key, arr);
    }
    return map;
  }, [dealFollowUps]);

  const customByDate = useMemo(() => {
    const map = new Map<string, CustomEvent[]>();
    for (const e of customEvents) {
      const arr = map.get(e.date) ?? [];
      arr.push(e);
      map.set(e.date, arr);
    }
    return map;
  }, [customEvents]);

  const notesByDate = useMemo(() => {
    const map = new Map<string, CalendarNote[]>();
    for (const n of calendarNotes) {
      const arr = map.get(n.date) ?? [];
      arr.push(n);
      map.set(n.date, arr);
    }
    return map;
  }, [calendarNotes]);

  // ── Navigation ───────────────────────────────────────────────────────────

  function prevMonth() {
    if (currentMonth === 0) {
      setCurrentMonth(11);
      setCurrentYear(currentYear - 1);
    } else {
      setCurrentMonth(currentMonth - 1);
    }
  }

  function nextMonth() {
    if (currentMonth === 11) {
      setCurrentMonth(0);
      setCurrentYear(currentYear + 1);
    } else {
      setCurrentMonth(currentMonth + 1);
    }
  }

  function prevWeek() {
    setCurrentDate(addDays(currentDate, -7));
  }

  function nextWeek() {
    setCurrentDate(addDays(currentDate, 7));
  }

  function prevDay() {
    const d = addDays(currentDate, -1);
    setCurrentDate(d);
    setSelectedDate(toDateKey(d));
  }

  function nextDay() {
    const d = addDays(currentDate, 1);
    setCurrentDate(d);
    setSelectedDate(toDateKey(d));
  }

  function goToday() {
    const t = new Date();
    setCurrentMonth(t.getMonth());
    setCurrentYear(t.getFullYear());
    setCurrentDate(t);
    setSelectedDate(toDateKey(t));
  }

  function selectDate(dateKey: string) {
    setSelectedDate(dateKey);
    setFormDate(dateKey);
    const d = parseDateKey(dateKey);
    setCurrentDate(d);
  }

  // ── Custom event CRUD ────────────────────────────────────────────────────

  async function handleAddEvent(e: FormEvent) {
    e.preventDefault();
    if (!formTitle.trim()) return;
    setFormSubmitting(true);

    try {
      const res = await fetch(`/api/calendar/events`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          slug,
          title: formTitle.trim(),
          date: formDate,
          time: formTime || null,
          description: formDescription.trim() || null,
          color: formColor,
        }),
      });

      if (res.ok) {
        const newEvent: CustomEvent = await res.json();
        setCustomEvents((prev) => [...prev, newEvent]);
        setFormTitle('');
        setFormTime('');
        setFormDescription('');
        setFormColor('gray');
        setShowAddForm(false);
      }
    } catch {
      // Silently fail — user can retry
    } finally {
      setFormSubmitting(false);
    }
  }

  async function handleDeleteEvent(id: string) {
    try {
      const res = await fetch(`/api/calendar/events?id=${id}`, { method: 'DELETE' });
      if (res.ok) {
        setCustomEvents((prev) => prev.filter((e) => e.id !== id));
      }
    } catch {
      // Silently fail
    }
  }

  async function handleAddNote(e: React.FormEvent) {
    e.preventDefault();
    if (!noteText.trim()) return;
    setNoteSubmitting(true);
    try {
      const res = await fetch('/api/calendar/notes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug, date: selectedDate, note: noteText.trim() }),
      });
      if (res.ok) {
        const newNote: CalendarNote = await res.json();
        setCalendarNotes((prev) => [...prev, newNote]);
        setNoteText('');
        setShowAddNote(false);
      }
    } catch {
      // Silently fail
    } finally {
      setNoteSubmitting(false);
    }
  }

  async function handleDeleteNote(id: string) {
    try {
      const res = await fetch(`/api/calendar/notes?id=${id}`, { method: 'DELETE' });
      if (res.ok) {
        setCalendarNotes((prev) => prev.filter((n) => n.id !== id));
      }
    } catch {
      // Silently fail
    }
  }

  // ── Selected day data ────────────────────────────────────────────────────

  const selectedTours = selectedDate ? toursByDate.get(selectedDate) ?? [] : [];
  const selectedContacts = selectedDate ? contactsByDate.get(selectedDate) ?? [] : [];
  const selectedDeals = selectedDate ? dealsByDate.get(selectedDate) ?? [] : [];
  const selectedCustom = selectedDate ? customByDate.get(selectedDate) ?? [] : [];
  const selectedNotes = selectedDate ? notesByDate.get(selectedDate) ?? [] : [];
  const hasSelectedEvents =
    selectedTours.length + selectedContacts.length + selectedDeals.length + selectedCustom.length + selectedNotes.length > 0;

  // ── Month grid computation ───────────────────────────────────────────────

  const firstDayOfMonth = new Date(currentYear, currentMonth, 1);
  const startDow = firstDayOfMonth.getDay();
  const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();

  const cells: (number | null)[] = [];
  for (let i = 0; i < startDow; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);

  // ── Week computation ─────────────────────────────────────────────────────

  const weekStart = getMonday(currentDate);
  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));

  function weekLabel(): string {
    const first = weekDays[0];
    const last = weekDays[6];
    const fMonth = MONTH_NAMES_SHORT[first.getMonth()];
    const lMonth = MONTH_NAMES_SHORT[last.getMonth()];
    if (first.getMonth() === last.getMonth()) {
      return `${fMonth} ${first.getDate()} - ${last.getDate()}, ${first.getFullYear()}`;
    }
    if (first.getFullYear() === last.getFullYear()) {
      return `${fMonth} ${first.getDate()} - ${lMonth} ${last.getDate()}, ${first.getFullYear()}`;
    }
    return `${fMonth} ${first.getDate()}, ${first.getFullYear()} - ${lMonth} ${last.getDate()}, ${last.getFullYear()}`;
  }

  // ── Day label ────────────────────────────────────────────────────────────

  function dayLabel(): string {
    const d = parseDateKey(selectedDate);
    return `${DAY_NAMES_FULL[d.getDay()]}, ${MONTH_NAMES[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
  }

  // ── Dot indicators for a date key ────────────────────────────────────────

  function renderDots(dateKey: string) {
    const hasTours = toursByDate.has(dateKey);
    const hasContacts = contactsByDate.has(dateKey);
    const hasDeals = dealsByDate.has(dateKey);
    const hasCustom = customByDate.has(dateKey);

    if (!hasTours && !hasContacts && !hasDeals && !hasCustom) return null;

    return (
      <div className="flex gap-1 mt-0.5 md:mt-1 flex-wrap">
        {hasTours && <span className="w-1.5 h-1.5 rounded-full bg-orange-500" />}
        {hasContacts && <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />}
        {hasDeals && <span className="w-1.5 h-1.5 rounded-full bg-slate-400 dark:bg-slate-500" />}
        {hasCustom && (
          <span className={`text-[8px] leading-none ${colorToDotClass(customByDate.get(dateKey)![0].color)}`}>
            &#x2756;
          </span>
        )}
      </div>
    );
  }

  // ── Mini event cards for week view ───────────────────────────────────────

  function renderMiniEvents(dateKey: string) {
    const dayTours = toursByDate.get(dateKey) ?? [];
    const dayContacts = contactsByDate.get(dateKey) ?? [];
    const dayDeals = dealsByDate.get(dateKey) ?? [];
    const dayCustom = customByDate.get(dateKey) ?? [];

    return (
      <div className="space-y-1 mt-1 overflow-y-auto max-h-32">
        {dayTours.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => selectDate(dateKey)}
            className="block w-full text-left text-[10px] leading-tight bg-orange-50 dark:bg-orange-950/30 border border-orange-200 dark:border-orange-800 rounded px-1 py-0.5 truncate hover:bg-orange-100 dark:hover:bg-orange-950/50 transition-colors"
          >
            <span className="font-medium">{t.guestName}</span>
            <span className="text-muted-foreground ml-1">{formatTime(t.startsAt)}</span>
          </button>
        ))}
        {dayContacts.map((c) => (
          <Link
            key={c.id}
            href={`/s/${slug}/contacts/${c.id}`}
            className="block text-[10px] leading-tight bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded px-1 py-0.5 truncate hover:bg-blue-100 dark:hover:bg-blue-950/50 transition-colors"
          >
            <span className="font-medium">{c.name}</span>
          </Link>
        ))}
        {dayDeals.map((d) => (
          <Link
            key={d.id}
            href={`/s/${slug}/deals/${d.id}`}
            className="block text-[10px] leading-tight bg-muted/60 border border-border rounded px-1 py-0.5 truncate hover:bg-muted transition-colors"
          >
            <span className="font-medium">{d.title}</span>
          </Link>
        ))}
        {dayCustom.map((e) => (
          <button
            key={e.id}
            onClick={() => selectDate(dateKey)}
            className={`block w-full text-left text-[10px] leading-tight rounded px-1 py-0.5 truncate transition-colors border ${
              e.color === 'orange' ? 'bg-orange-50 dark:bg-orange-950/30 border-orange-200 dark:border-orange-800' :
              e.color === 'blue' ? 'bg-blue-50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-800' :
              e.color === 'purple' ? 'bg-purple-50 dark:bg-purple-950/30 border-purple-200 dark:border-purple-800' :
              e.color === 'green' ? 'bg-green-50 dark:bg-green-950/30 border-green-200 dark:border-green-800' :
              e.color === 'red' ? 'bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-800' :
              'bg-gray-50 dark:bg-gray-950/30 border-gray-200 dark:border-gray-800'
            }`}
          >
            <span className={`${colorToDotClass(e.color)} mr-0.5`}>&#x2756;</span>
            <span className="font-medium">{e.title}</span>
            {e.time && <span className="text-muted-foreground ml-1">{e.time}</span>}
          </button>
        ))}
      </div>
    );
  }

  // ── Detail panel (shared by all views) ───────────────────────────────────

  function renderDetailPanel() {
    if (!selectedDate) return null;

    return (
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className={H3}>
            {new Date(selectedDate + 'T00:00:00').toLocaleDateString('en-US', {
              weekday: 'long',
              month: 'long',
              day: 'numeric',
              year: 'numeric',
            })}
          </h3>
          <div className="flex items-center gap-2">
            <button
              onClick={() => { setShowAddNote(!showAddNote); setShowAddForm(false); }}
              className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground font-medium transition-colors"
            >
              <Plus className="h-3.5 w-3.5" />
              Add note
            </button>
            <button
              onClick={() => { setShowAddForm(!showAddForm); setShowAddNote(false); setFormDate(selectedDate); }}
              className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground font-medium transition-colors"
            >
              <Plus className="h-3.5 w-3.5" />
              Add event
            </button>
          </div>
        </div>

        {/* Inline add-event form */}
        {showAddForm && (
          <Card>
            <CardContent className="p-4">
              <form onSubmit={handleAddEvent} className="space-y-3">
                <div>
                  <label className="block text-xs font-medium mb-1">Title *</label>
                  <input
                    type="text"
                    value={formTitle}
                    onChange={(e) => setFormTitle(e.target.value)}
                    required
                    className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                    placeholder="Event title"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium mb-1">Date *</label>
                    <input
                      type="date"
                      value={formDate}
                      onChange={(e) => setFormDate(e.target.value)}
                      required
                      className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium mb-1">Time</label>
                    <input
                      type="time"
                      value={formTime}
                      onChange={(e) => setFormTime(e.target.value)}
                      className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1">Description</label>
                  <textarea
                    value={formDescription}
                    onChange={(e) => setFormDescription(e.target.value)}
                    rows={2}
                    className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring resize-none"
                    placeholder="Optional description"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1">Color</label>
                  <div className="flex gap-2">
                    {COLOR_OPTIONS.map((opt) => (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => setFormColor(opt.value)}
                        className={`w-6 h-6 rounded-full ${opt.dot} transition-all ${
                          formColor === opt.value
                            ? 'ring-2 ring-offset-2 ring-foreground'
                            : 'opacity-50 hover:opacity-75'
                        }`}
                        title={opt.label}
                      />
                    ))}
                  </div>
                </div>
                <div className="flex gap-2 pt-1">
                  <button
                    type="submit"
                    disabled={formSubmitting}
                    className="px-3 py-1.5 text-xs font-medium rounded-md bg-foreground text-background hover:opacity-80 disabled:opacity-50 transition-opacity"
                  >
                    {formSubmitting ? 'Saving' : 'Save event'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowAddForm(false)}
                    className="px-3 py-1.5 text-xs font-medium rounded-md border border-border hover:bg-muted transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            </CardContent>
          </Card>
        )}

        {/* Inline add-note form */}
        {showAddNote && (
          <Card>
            <CardContent className="p-4">
              <form onSubmit={handleAddNote} className="space-y-3">
                <div>
                  <label className="block text-xs font-medium mb-1">Note *</label>
                  <textarea
                    value={noteText}
                    onChange={(e) => setNoteText(e.target.value)}
                    rows={3}
                    required
                    autoFocus
                    className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring resize-none"
                    placeholder="Add a note for this date…"
                  />
                </div>
                <div className="flex gap-2">
                  <button
                    type="submit"
                    disabled={noteSubmitting}
                    className="px-3 py-1.5 text-xs font-medium rounded-md bg-foreground text-background hover:opacity-80 disabled:opacity-50 transition-opacity"
                  >
                    {noteSubmitting ? 'Saving…' : 'Save note'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowAddNote(false)}
                    className="px-3 py-1.5 text-xs font-medium rounded-md border border-border hover:bg-muted transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            </CardContent>
          </Card>
        )}

        {!hasSelectedEvents && !showAddForm && !showAddNote && (
          <p className="text-sm text-muted-foreground">
            Nothing on this day.
          </p>
        )}

        {/* Tours — calendar absorbs the tour surface, so no link out. */}
        {selectedTours.map((tour) => (
          <Card key={tour.id} className="transition-colors">
            <CardContent className="p-4 flex items-start gap-3">
              <span className="mt-1 w-2 h-2 rounded-full bg-orange-500 shrink-0" />
              <div className="flex-1 min-w-0 space-y-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium text-sm truncate">
                    {tour.guestName}
                  </span>
                  <span
                    className={`text-xs px-2 py-0.5 rounded-full font-medium shrink-0 ${
                      tour.status === 'confirmed'
                        ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400'
                        : 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400'
                    }`}
                  >
                    {tour.status}
                  </span>
                </div>
                {tour.propertyAddress && (
                  <p className="text-xs text-muted-foreground flex items-center gap-1">
                    <MapPin className="h-3 w-3" />
                    {tour.propertyAddress}
                  </p>
                )}
                <p className="text-xs text-muted-foreground">
                  {formatTime(tour.startsAt)} &ndash; {formatTime(tour.endsAt)}
                </p>
              </div>
            </CardContent>
          </Card>
        ))}

        {/* Contact follow-ups */}
        {selectedContacts.map((contact) => {
          const urgency = getUrgency(contact.followUpAt);
          const chip = URGENCY_CHIP[urgency];
          return (
            <Link key={contact.id} href={`/s/${slug}/contacts/${contact.id}`} className="block group">
              <Card className="transition-colors group-hover:border-border">
                <CardContent className="p-4 flex items-start gap-3">
                  <span className="mt-1 w-2 h-2 rounded-full bg-blue-500 shrink-0" />
                  <div className="flex-1 min-w-0 space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-sm">{contact.name}</span>
                      <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${chip.className}`}>
                        {chip.label}
                      </span>
                    </div>
                    {contact.phone && (
                      <p className="text-xs text-muted-foreground flex items-center gap-1">
                        <Phone className="h-3 w-3" />
                        {contact.phone}
                      </p>
                    )}
                    {contact.email && (
                      <p className="text-xs text-muted-foreground flex items-center gap-1">
                        <Mail className="h-3 w-3" />
                        {contact.email}
                      </p>
                    )}
                  </div>
                </CardContent>
              </Card>
            </Link>
          );
        })}

        {/* Deal follow-ups */}
        {selectedDeals.map((deal) => (
          <Link key={deal.id} href={`/s/${slug}/deals/${deal.id}`} className="block group">
            <Card className="transition-colors group-hover:border-border">
              <CardContent className="p-4 flex items-start gap-3">
                <span className="mt-1 w-2 h-2 rounded-full bg-slate-400 dark:bg-slate-500 shrink-0" />
                <div className="flex-1 min-w-0 space-y-1">
                  <span className="font-medium text-sm flex items-center gap-1">
                    <Briefcase className="h-3.5 w-3.5" />
                    {deal.title}
                  </span>
                </div>
              </CardContent>
            </Card>
          </Link>
        ))}

        {/* Notes */}
        {selectedNotes.map((n) => (
          <Card key={n.id} className="border-yellow-200 dark:border-yellow-800/40">
            <CardContent className="p-4 flex items-start gap-3">
              <StickyNote className="mt-0.5 h-4 w-4 text-yellow-500 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm whitespace-pre-wrap break-words">{n.note}</p>
              </div>
              <button
                onClick={() => handleDeleteNote(n.id)}
                className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-destructive transition-colors shrink-0"
                title="Delete note"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </CardContent>
          </Card>
        ))}

        {/* Custom events */}
        {selectedCustom.map((evt) => (
          <Card key={evt.id}>
            <CardContent className="p-4 flex items-start gap-3">
              <span className={`mt-0.5 text-sm shrink-0 ${colorToDotClass(evt.color)}`}>&#x2756;</span>
              <div className="flex-1 min-w-0 space-y-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium text-sm">{evt.title}</span>
                  <button
                    onClick={() => handleDeleteEvent(evt.id)}
                    className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-destructive transition-colors shrink-0"
                    title="Delete event"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
                {evt.time && (
                  <p className="text-xs text-muted-foreground">{evt.time}</p>
                )}
                {evt.description && (
                  <p className="text-xs text-muted-foreground">{evt.description}</p>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      <header className="space-y-1.5">
        <p className="text-sm text-muted-foreground">Calendar.</p>
        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
          <div className="space-y-1.5">
            <h1 className={H1} style={TITLE_FONT}>
              Calendar
            </h1>
            <p className="text-sm text-muted-foreground">
              {tours.length > 0
                ? `${tours.length} ${tours.length === 1 ? 'tour' : 'tours'} scheduled${contactFollowUps.length + dealFollowUps.length > 0 ? `, ${contactFollowUps.length + dealFollowUps.length} follow-up${contactFollowUps.length + dealFollowUps.length === 1 ? '' : 's'} on the list` : ''}.`
                : 'Nothing scheduled — quiet week.'}
            </p>
          </div>
          <Link
            href={`/book/${slug}`}
            target="_blank"
            rel="noopener noreferrer"
            className={PRIMARY_PILL}
          >
            <CalendarPlus className="h-4 w-4" />
            Schedule tour
          </Link>
        </div>
      </header>

      {/* Tour stat strip — paper-flat, sits above the grid. */}
      <TourStatsStrip tours={tourStats} />

      {/* Layer filter — narrow the grid down to one event class. Custom
          events + notes always render; they aren't a queryable layer. */}
      <div className="flex items-center gap-1.5">
        {([
          { key: 'all', label: 'All' },
          { key: 'tours', label: 'Tours' },
          { key: 'followups', label: 'Follow-ups' },
        ] as const).map((chip) => (
          <button
            key={chip.key}
            type="button"
            onClick={() => setLayer(chip.key)}
            className={cn(
              'h-7 rounded-full border px-3 text-xs font-medium transition-colors duration-150',
              layer === chip.key
                ? 'border-foreground bg-foreground text-background'
                : 'border-border/70 bg-background text-muted-foreground hover:text-foreground hover:bg-foreground/[0.04]',
            )}
          >
            {chip.label}
          </button>
        ))}
      </div>

      {/* View mode tabs */}
      <div className="flex items-center gap-1 border-b border-border">
        {(['month', 'week', 'day'] as const).map((mode) => (
          <button
            key={mode}
            onClick={() => setView(mode)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              view === mode
                ? 'border-foreground text-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground hover:border-muted'
            }`}
          >
            {mode.charAt(0).toUpperCase() + mode.slice(1)}
          </button>
        ))}
      </div>

      {/* Navigation */}
      <div className="flex items-center justify-between">
        <button
          onClick={view === 'month' ? prevMonth : view === 'week' ? prevWeek : prevDay}
          className="p-2 rounded-md hover:bg-muted transition-colors"
          aria-label={`Previous ${view}`}
        >
          <ChevronLeft className="h-5 w-5" />
        </button>

        <div className="flex items-center gap-3">
          <h2 className={H2}>
            {view === 'month' && `${MONTH_NAMES[currentMonth]} ${currentYear}`}
            {view === 'week' && weekLabel()}
            {view === 'day' && dayLabel()}
          </h2>
          <button
            onClick={goToday}
            className="px-3 h-7 text-xs rounded-md border border-border/70 bg-background hover:bg-foreground/[0.04] transition-colors duration-150"
          >
            Today
          </button>
        </div>

        <button
          onClick={view === 'month' ? nextMonth : view === 'week' ? nextWeek : nextDay}
          className="p-2 rounded-md hover:bg-muted transition-colors"
          aria-label={`Next ${view}`}
        >
          <ChevronRight className="h-5 w-5" />
        </button>
      </div>

      {/* ── Month View ──────────────────────────────────────────────────── */}
      {view === 'month' && (
        <>
          <Card>
            <CardContent className="p-0">
              <div className="grid grid-cols-7 border-b border-border">
                {DAY_NAMES.map((d) => (
                  <div
                    key={d}
                    className="py-2 text-center text-xs font-medium text-muted-foreground"
                  >
                    {d}
                  </div>
                ))}
              </div>

              <div className="grid grid-cols-7">
                {cells.map((day, idx) => {
                  if (day === null) {
                    return (
                      <div
                        key={`blank-${idx}`}
                        className="h-12 md:h-20 border-b border-r border-border last:border-r-0"
                      />
                    );
                  }

                  const dateKey = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                  const isToday = dateKey === todayKey;
                  const isSelected = dateKey === selectedDate;

                  return (
                    <button
                      key={dateKey}
                      onClick={() => selectDate(dateKey)}
                      className={`
                        h-12 md:h-20 border-b border-r border-border p-1 md:p-2
                        text-left transition-colors relative
                        hover:bg-muted/30
                        ${isSelected ? 'bg-muted/40 border-border' : ''}
                      `}
                    >
                      <span
                        className={`
                          inline-flex items-center justify-center text-sm
                          ${isToday ? 'w-7 h-7 rounded-full bg-foreground text-background font-semibold' : ''}
                        `}
                      >
                        {day}
                      </span>
                      {renderDots(dateKey)}
                    </button>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          {/* Legend */}
          <div className="flex gap-4 text-xs text-muted-foreground flex-wrap">
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-orange-500" /> Tours
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-blue-500" /> Contact follow-ups
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-slate-400 dark:bg-slate-500" /> Deal follow-ups
            </span>
            <span className="flex items-center gap-1.5">
              <span className="text-gray-500">&#x2756;</span> Custom events
            </span>
          </div>
        </>
      )}

      {/* ── Week View ───────────────────────────────────────────────────── */}
      {view === 'week' && (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <div className="grid grid-cols-7 min-w-[600px]">
                {/* Header */}
                {weekDays.map((d, i) => {
                  const key = toDateKey(d);
                  const isToday = key === todayKey;
                  const isSelected = key === selectedDate;

                  return (
                    <button
                      key={key}
                      onClick={() => selectDate(key)}
                      className={`
                        border-b border-r border-border p-2 text-center transition-colors
                        hover:bg-muted/30
                        ${isSelected ? 'bg-muted/40' : ''}
                      `}
                    >
                      <div className="text-xs font-medium text-muted-foreground">
                        {DAY_NAMES_WEEK[i]}
                      </div>
                      <div
                        className={`
                          text-lg font-semibold mt-0.5
                          ${isToday ? 'w-8 h-8 mx-auto rounded-full bg-foreground text-background flex items-center justify-center' : ''}
                        `}
                      >
                        {d.getDate()}
                      </div>
                    </button>
                  );
                })}

                {/* Event cells */}
                {weekDays.map((d) => {
                  const key = toDateKey(d);
                  const isSelected = key === selectedDate;

                  return (
                    <div
                      key={`events-${key}`}
                      className={`
                        border-r border-border p-1.5 min-h-[120px] transition-colors
                        ${isSelected ? 'bg-muted/40' : ''}
                      `}
                    >
                      {renderMiniEvents(key)}
                    </div>
                  );
                })}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Day View ────────────────────────────────────────────────────── */}
      {view === 'day' && (
        <div>
          {/* Day view shows the detail panel directly, no extra grid needed */}
        </div>
      )}

      {/* Detail panel (shown for all views) */}
      {renderDetailPanel()}
    </div>
  );
}
