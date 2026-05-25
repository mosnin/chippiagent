'use client';

import { useState } from 'react';
import {
  MessageCircle,
  User,
  Mail,
  Phone,
  MapPin,
  CalendarDays,
  Clock,
  AlertTriangle,
  MessageSquare,
  ChevronDown,
  ChevronUp,
  Loader2,
  FileText,
  TrendingUp,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface TourPrepData {
  guestName: string;
  guestEmail: string;
  guestPhone: string | null;
  propertyAddress: string | null;
  tourDate: string;
  tourTime: string;
  duration: number;
  contactHighlights: string[];
  scoreInfo: { score: number | null; label: string | null; summary: string | null } | null;
  applicationHighlights: string[];
  talkingPoints: string[];
  previousTours: number;
  warnings: string[];
}

interface TourPrepCardProps {
  tourId: string;
}

export function TourPrepCard({ tourId }: TourPrepCardProps) {
  const [prep, setPrep] = useState<TourPrepData | null>(null);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [loaded, setLoaded] = useState(false);

  async function loadPrep() {
    if (loaded) { setExpanded(!expanded); return; }
    setLoading(true);
    try {
      const res = await fetch(`/api/tours/${tourId}/prep`);
      if (res.ok) {
        setPrep(await res.json());
        setLoaded(true);
        setExpanded(true);
      }
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <button
        onClick={loadPrep}
        disabled={loading}
        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs border border-primary/30 bg-primary/5 text-primary hover:bg-primary/10 transition-colors disabled:opacity-50"
      >
        {loading ? <Loader2 size={12} className="animate-spin" /> : <MessageCircle size={12} />}
        Prep
        {expanded ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
      </button>

      {expanded && prep && (
        <div className="absolute right-0 top-full mt-2 z-30 w-80 sm:w-96 rounded-lg border border-border bg-card shadow-xl overflow-hidden">
          {/* Header */}
          <div className="px-4 py-3 bg-primary/5 border-b border-border">
            <div className="flex items-center gap-2 text-xs font-semibold text-primary">
              <MessageCircle size={13} />
              Tour Prep — {prep.guestName}
            </div>
            <div className="flex items-center gap-3 mt-1.5 text-[10px] text-muted-foreground">
              <span className="flex items-center gap-1"><CalendarDays size={10} /> {prep.tourDate}</span>
              <span className="flex items-center gap-1"><Clock size={10} /> {prep.tourTime} ({prep.duration}min)</span>
            </div>
          </div>

          <div className="p-4 space-y-3 max-h-80 overflow-y-auto">
            {/* Guest info */}
            <div className="space-y-1">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60">Guest</p>
              <div className="space-y-0.5 text-xs">
                <p className="flex items-center gap-1.5"><User size={11} className="text-muted-foreground" /> {prep.guestName}</p>
                <p className="flex items-center gap-1.5"><Mail size={11} className="text-muted-foreground" /> {prep.guestEmail}</p>
                {prep.guestPhone && <p className="flex items-center gap-1.5"><Phone size={11} className="text-muted-foreground" /> {prep.guestPhone}</p>}
                {prep.propertyAddress && <p className="flex items-center gap-1.5"><MapPin size={11} className="text-muted-foreground" /> {prep.propertyAddress}</p>}
                {prep.previousTours > 0 && <p className="text-[10px] text-muted-foreground">{prep.previousTours} previous tour{prep.previousTours > 1 ? 's' : ''}</p>}
              </div>
            </div>

            {/* Score */}
            {prep.scoreInfo && prep.scoreInfo.score != null && (
              <div className="space-y-1">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60">Lead Score</p>
                <div className="flex items-center gap-2">
                  <span className="text-lg font-bold tabular-nums">{Math.round(prep.scoreInfo.score)}</span>
                  <span className={cn(
                    'text-[10px] font-semibold uppercase px-2 py-0.5 rounded-full',
                    prep.scoreInfo.label === 'hot' ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' :
                    prep.scoreInfo.label === 'warm' ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400' :
                    'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400'
                  )}>
                    {prep.scoreInfo.label}
                  </span>
                </div>
                {prep.scoreInfo.summary && (
                  <p className="text-[10px] text-muted-foreground leading-relaxed">{prep.scoreInfo.summary}</p>
                )}
              </div>
            )}

            {/* Contact highlights */}
            {prep.contactHighlights.length > 0 && (
              <div className="space-y-1">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60">Contact profile</p>
                <div className="space-y-0.5">
                  {prep.contactHighlights.map((h, i) => (
                    <p key={i} className="text-xs text-muted-foreground">{h}</p>
                  ))}
                </div>
              </div>
            )}

            {/* Application highlights */}
            {prep.applicationHighlights.length > 0 && (
              <div className="space-y-1">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60">Application</p>
                <div className="space-y-0.5">
                  {prep.applicationHighlights.map((h, i) => (
                    <p key={i} className="text-xs text-muted-foreground">{h}</p>
                  ))}
                </div>
              </div>
            )}

            {/* Warnings */}
            {prep.warnings.length > 0 && (
              <div className="space-y-1">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-red-500/60">Risk Flags</p>
                <div className="space-y-0.5">
                  {prep.warnings.map((w, i) => (
                    <p key={i} className="text-xs text-red-600 dark:text-red-400 flex items-center gap-1.5">
                      <AlertTriangle size={10} /> {w}
                    </p>
                  ))}
                </div>
              </div>
            )}

            {/* Talking points */}
            <div className="space-y-1">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60">Talking Points</p>
              <div className="space-y-1">
                {prep.talkingPoints.map((t, i) => (
                  <p key={i} className="text-xs text-foreground flex items-start gap-1.5">
                    <MessageSquare size={10} className="text-primary flex-shrink-0 mt-0.5" />
                    {t}
                  </p>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
