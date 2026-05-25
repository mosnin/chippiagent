'use client';

import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { EASE_OUT, DURATION_BASE } from '@/lib/motion';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Artifact {
  id: string;
  type: string;
  title: string;
  content?: string;
  versionNumber?: number;
  currentVersionId?: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

type BadgeVariant = 'email' | 'draft' | 'report' | 'other';

function getTypeBadge(type: string): { label: string; className: string } {
  const t = type.toLowerCase() as BadgeVariant;
  switch (t) {
    case 'email':
      return {
        label: 'Email',
        className:
          'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-800/60',
      };
    case 'draft':
      return {
        label: 'Draft',
        className:
          'bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-950/40 dark:text-purple-300 dark:border-purple-800/60',
      };
    case 'report':
      return {
        label: 'Report',
        className:
          'bg-green-50 text-green-700 border-green-200 dark:bg-green-950/40 dark:text-green-300 dark:border-green-800/60',
      };
    default:
      return {
        label: type || 'Other',
        className:
          'bg-muted text-muted-foreground border-border',
      };
  }
}

function truncate(str: string | undefined, max: number): string {
  if (!str) return '';
  return str.length <= max ? str : `${str.slice(0, max)}…`;
}

// ─── Card variants ────────────────────────────────────────────────────────────

const CARD_VARIANTS = {
  hidden: { opacity: 0, y: 8 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: DURATION_BASE, ease: EASE_OUT },
  },
};

const GRID_VARIANTS = {
  hidden: {},
  visible: {
    transition: { staggerChildren: 0.06 },
  },
};

// ─── Artifact card ────────────────────────────────────────────────────────────

function ArtifactCard({
  artifact,
  onVersionSelect,
}: {
  artifact: Artifact;
  onVersionSelect?: (id: string) => void;
}) {
  const badge = getTypeBadge(artifact.type);
  const preview = truncate(artifact.content, 120);
  const version = artifact.versionNumber != null ? `v${artifact.versionNumber}` : null;

  return (
    <motion.div
      variants={CARD_VARIANTS}
      className="flex flex-col gap-2 rounded-xl border border-border/60 bg-background p-4 hover:bg-muted/20 transition-colors"
    >
      {/* Top row: badge + version */}
      <div className="flex items-center justify-between gap-2">
        <span
          className={cn(
            'inline-flex items-center text-[11px] font-semibold px-2 py-0.5 rounded-full border',
            badge.className,
          )}
        >
          {badge.label}
        </span>
        {version && (
          <span className="text-[11px] font-mono text-muted-foreground">{version}</span>
        )}
      </div>

      {/* Title */}
      <p className="text-sm font-semibold text-foreground leading-snug line-clamp-2">
        {artifact.title}
      </p>

      {/* Preview */}
      {preview ? (
        <p className="text-xs text-muted-foreground leading-relaxed flex-1">{preview}</p>
      ) : (
        <p className="text-xs text-muted-foreground italic flex-1">No preview available.</p>
      )}

      {/* View button */}
      <Button
        size="sm"
        variant="outline"
        className="w-full mt-1 text-xs h-7"
        onClick={() => onVersionSelect?.(artifact.id)}
      >
        View
      </Button>
    </motion.div>
  );
}

// ─── Export ───────────────────────────────────────────────────────────────────

export function ArtifactPanel({
  artifacts,
  onVersionSelect,
}: {
  artifacts: Artifact[];
  onVersionSelect?: (id: string) => void;
}) {
  if (artifacts.length === 0) {
    return (
      <p className="text-sm text-muted-foreground text-center py-6">No artifacts yet.</p>
    );
  }

  return (
    <motion.div
      className="grid grid-cols-1 md:grid-cols-2 gap-3"
      variants={GRID_VARIANTS}
      initial="hidden"
      animate="visible"
    >
      {artifacts.map((artifact) => (
        <ArtifactCard
          key={artifact.id}
          artifact={artifact}
          onVersionSelect={onVersionSelect}
        />
      ))}
    </motion.div>
  );
}
