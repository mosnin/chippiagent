'use client';

/**
 * ToolGroupBlockView — renders a sequence of consecutive ToolCallBlocks as a
 * single collapsible group (chevron + shimmer-header + nested rows). Mirrors
 * Claude and ChatGPT's "Task completed, 3 files, 1 search, 6s" pattern.
 *
 * Decision: groups of 2+ tools collapse here. A single tool keeps the
 * existing per-block rich view (`ToolCallBlockView`) — that's where the
 * inline contacts / deals / tours / properties cards live, and we don't want
 * to bury them inside a collapsed header for the common one-tool turn.
 *
 * Rich result cards from the grouped tools render BELOW the group header so
 * the realtor still sees the answer without expanding. The group itself is
 * the meta-line; the data cards are the substance.
 */

import { useMemo } from 'react';
import { ToolGroup, type NestedTool, type NestedToolCategory } from '@/components/ui/tool-group';
import type { ToolCallBlock } from '@/lib/ai-tools/blocks';
import { ContactsResult } from './tool-results/contacts-result';
import { DealsResult } from './tool-results/deals-result';
import { ToursResult } from './tool-results/tours-result';
import { PropertiesResult } from './tool-results/properties-result';
import { AvailabilityPickerCard } from './tool-results/availability-picker-card';

/** snake_case → "Search contacts". Repeated from tool-call-block-view to keep
 *  these two surfaces independent — the inline view may diverge later. */
function friendlyName(name: string): string {
  return name
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

/** Read-only verbs (search/find/get/recall/check/pipeline/analyze) map to
 *  the search icon; everything else is an action → command icon. `file` is
 *  reserved for note reads where "file" reads more naturally than "search". */
function categorizeToolName(name: string): NestedToolCategory {
  if (/^(get_note|read_)/.test(name)) return 'file';
  if (
    /^(search|find|get|recall|check|pipeline|analyze|list)_/.test(name) ||
    name === 'pipeline_summary' ||
    name === 'find_overdue_followups' ||
    name === 'find_quiet_hot_persons' ||
    name === 'find_stuck_deals'
  ) {
    return 'search';
  }
  return 'command';
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Short prose subtitle derived from args. UUID fields are skipped — they
 *  mean nothing to a realtor. */
function argsSubtitle(args: Record<string, unknown> | undefined | null): string | undefined {
  if (!args) return undefined;
  const isUUID = (v: unknown): boolean => typeof v === 'string' && UUID_RE.test(v);

  if (typeof args.name === 'string' && args.name && !isUUID(args.name)) return args.name;
  if (typeof args.query === 'string' && args.query) return args.query;
  if (typeof args.subject === 'string' && args.subject) return args.subject;
  if (typeof args.stage === 'string' && args.stage) return `→ ${args.stage}`;

  const SKIP_KEYS = new Set(['contactId', 'dealId', 'tourId', 'propertyId', 'id']);
  const meaningful = Object.entries(args).filter(
    ([k, v]) => !SKIP_KEYS.has(k) && !isUUID(v) && typeof v !== 'object',
  );
  if (meaningful.length === 0) return undefined;

  const [, val] = meaningful[0];
  if (typeof val === 'string' && val) return val.length > 60 ? `${val.slice(0, 57)}…` : val;
  if (typeof val === 'number') return String(val);
  return undefined;
}

function toNestedTool(block: ToolCallBlock): NestedTool {
  return {
    category: categorizeToolName(block.name),
    title: friendlyName(block.name),
    subtitle: argsSubtitle(block.args),
    isError: block.status === 'error',
  };
}

/** Inline rich card for completed tools that returned a known data shape.
 *  Same switch as tool-call-block-view — duplicated rather than re-exported
 *  to keep the two views structurally independent. */
function richResultFor(
  block: ToolCallBlock,
  onUserIntent?: (text: string) => void,
): React.ReactNode {
  if (block.status !== 'complete' || !block.result?.ok) return null;
  const data = block.result.data as Record<string, unknown> | undefined;
  if (!data) return null;
  if (block.display === 'contacts' && Array.isArray((data as { contacts?: unknown[] }).contacts)) {
    return <ContactsResult data={data as { contacts: never[] }} />;
  }
  if (block.display === 'deals' && Array.isArray((data as { deals?: unknown[] }).deals)) {
    return <DealsResult data={data as { deals: never[] }} />;
  }
  if (block.display === 'tours' && Array.isArray((data as { tours?: unknown[] }).tours)) {
    return <ToursResult data={data as { tours: never[] }} />;
  }
  if (block.display === 'properties' && Array.isArray((data as { properties?: unknown[] }).properties)) {
    return <PropertiesResult data={data as { properties: never[] }} />;
  }
  if (
    block.display === 'availability-picker' &&
    Array.isArray((data as { slots?: unknown[] }).slots)
  ) {
    const d = data as {
      slots: Array<{ startsAt: string; endsAt: string; label: string }>;
      contactId?: string;
      propertyAddress?: string;
      durationMinutes?: number;
    };
    return (
      <AvailabilityPickerCard
        slots={d.slots}
        contactId={d.contactId}
        propertyAddress={d.propertyAddress}
        durationMinutes={d.durationMinutes ?? 60}
        onSelectSlot={onUserIntent}
      />
    );
  }
  return null;
}

export interface ToolGroupBlockViewProps {
  blocks: ToolCallBlock[];
  /** Call IDs that are mid-flight this turn. If any group member is live the
   *  whole group renders in the `pending` shimmer state — Claude-style. */
  liveCallIds?: Set<string>;
  /** Forwarded to interactive rich cards (availability picker). */
  onUserIntent?: (text: string) => void;
}

export function ToolGroupBlockView({ blocks, liveCallIds, onUserIntent }: ToolGroupBlockViewProps) {
  const nestedTools = useMemo(() => blocks.map(toNestedTool), [blocks]);

  const anyLive = blocks.some((b) => liveCallIds?.has(b.callId));
  const state = anyLive ? 'pending' : 'completed';

  // Pending headline reads as an active verb so the shimmer feels alive —
  // the existing thinking-indicator pattern. Completed is calm and final.
  const completeLabel = 'Task completed';
  const shimmerLabel = inferShimmerLabel(blocks);

  // Rich result cards — only completed tools with a known display shape.
  // Rendered below the collapsed header so the realtor sees the answer
  // without needing to click expand.
  const richCards = blocks
    .map((b) => {
      const node = richResultFor(b, onUserIntent);
      return node ? <div key={`rich-${b.callId}`}>{node}</div> : null;
    })
    .filter(Boolean);

  return (
    <div className="space-y-2">
      <ToolGroup
        state={state}
        nestedTools={nestedTools}
        completeLabel={completeLabel}
        shimmerLabel={shimmerLabel}
        interruptedLabel="Stopped"
        // Elapsed time tracking isn't on ToolCallBlock yet — hide the metric
        // rather than show a fabricated one.
        showElapsed={false}
        maxVisibleTools={5}
      />
      {richCards.length > 0 && <div className="space-y-2">{richCards}</div>}
    </div>
  );
}

/** Pick a shimmer label that matches what the group is actually doing.
 *  Mostly-search tools read as "Searching"; mostly-action tools as "Working". */
function inferShimmerLabel(blocks: ToolCallBlock[]): string {
  let search = 0;
  let command = 0;
  for (const b of blocks) {
    const c = categorizeToolName(b.name);
    if (c === 'search' || c === 'file') search += 1;
    else if (c === 'command') command += 1;
  }
  if (search > 0 && command === 0) return 'Searching';
  if (command > 0 && search === 0) return 'Working';
  return 'Working';
}
