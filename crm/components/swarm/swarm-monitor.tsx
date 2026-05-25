'use client';

import { useEffect, useReducer, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '@/lib/utils';
import { TITLE_FONT, BODY_MUTED, SECTION_LABEL, CAPTION } from '@/lib/typography';
import { EASE_OUT, DURATION_BASE } from '@/lib/motion';
import type { SwarmRun, SwarmMember, SwarmEventType } from '@/lib/swarm-types';
import { SwarmAgentCard } from './swarm-agent-card';
import { SwarmTimeline } from './swarm-timeline';
import { SwarmOutputPanel } from './swarm-output-panel';

// ─── State ────────────────────────────────────────────────────────────────────

interface SwarmState {
  status: string;
  members: Record<string, Partial<SwarmMember>>;
  events: Array<{ type: string; data: Record<string, unknown>; ts: number }>;
  result: string | null;
  planTaskCount: number | null;
  error: string | null;
  connected: boolean;
  /** Per-member live thinking text (not stored on member so we can update it fast). */
  thinking: Record<string, string>;
}

type SwarmAction =
  | { type: 'connected'; payload: Record<string, unknown> }
  | { type: 'swarm_planning'; payload: Record<string, unknown> }
  | { type: 'plan_created'; payload: Record<string, unknown> }
  | { type: 'agent_started'; payload: Record<string, unknown> }
  | { type: 'agent_thinking'; payload: Record<string, unknown> }
  | { type: 'agent_completed'; payload: Record<string, unknown> }
  | { type: 'agent_failed'; payload: Record<string, unknown> }
  | { type: 'wave_2_starting'; payload: Record<string, unknown> }
  | { type: 'audit_started'; payload: Record<string, unknown> }
  | { type: 'swarm_completed'; payload: Record<string, unknown> }
  | { type: 'swarm_failed'; payload: Record<string, unknown> }
  | { type: 'swarm_cancelled'; payload: Record<string, unknown> }
  | { type: 'stream_end'; payload: Record<string, unknown> }
  | { type: 'disconnect'; payload?: undefined };

function appendEvent(
  state: SwarmState,
  type: string,
  data: Record<string, unknown>,
): Pick<SwarmState, 'events'> {
  return {
    events: [...state.events, { type, data, ts: Date.now() }],
  };
}

function memberId(payload: Record<string, unknown>): string | null {
  const id = payload.memberId ?? payload.member_id ?? payload.id;
  return typeof id === 'string' ? id : null;
}

function reducer(state: SwarmState, action: SwarmAction): SwarmState {
  const { type, payload } = action;
  const evBase = payload ? appendEvent(state, type, payload) : {};

  switch (type) {
    case 'connected':
      return { ...state, connected: true, ...evBase };

    case 'swarm_planning':
      return { ...state, status: 'planning', ...evBase };

    case 'plan_created': {
      const raw = payload?.taskCount ?? payload?.task_count;
      const count = typeof raw === 'number' ? raw : null;
      return { ...state, planTaskCount: count, status: 'running', ...evBase };
    }

    case 'agent_started': {
      const id = memberId(payload ?? {});
      if (!id) return { ...state, ...evBase };
      const existing = state.members[id] ?? {};
      return {
        ...state,
        members: {
          ...state.members,
          [id]: {
            ...existing,
            id,
            name: (payload?.name as string) ?? existing.name ?? 'Agent',
            role: (payload?.role as string) ?? existing.role ?? null,
            task: (payload?.task as string) ?? existing.task ?? '',
            wave: typeof payload?.wave === 'number' ? payload.wave : (existing.wave ?? 1),
            status: 'running',
          },
        },
        ...evBase,
      };
    }

    case 'agent_thinking': {
      const id = memberId(payload ?? {});
      if (!id) return { ...state, ...evBase };
      const message = typeof payload?.message === 'string' ? payload.message : 'Thinking…';
      return {
        ...state,
        thinking: { ...state.thinking, [id]: message },
        ...evBase,
      };
    }

    case 'agent_completed': {
      const id = memberId(payload ?? {});
      if (!id) return { ...state, ...evBase };
      const existing = state.members[id] ?? {};
      const { [id]: _removed, ...restThinking } = state.thinking;
      return {
        ...state,
        members: {
          ...state.members,
          [id]: {
            ...existing,
            id,
            status: 'completed',
            output: typeof payload?.output === 'string' ? payload.output : (existing.output ?? null),
            completedAt: typeof payload?.completedAt === 'string' ? payload.completedAt : undefined,
          },
        },
        thinking: restThinking,
        ...evBase,
      };
    }

    case 'agent_failed': {
      const id = memberId(payload ?? {});
      if (!id) return { ...state, ...evBase };
      const existing = state.members[id] ?? {};
      const { [id]: _removed, ...restThinking } = state.thinking;
      return {
        ...state,
        members: {
          ...state.members,
          [id]: { ...existing, id, status: 'failed' },
        },
        thinking: restThinking,
        ...evBase,
      };
    }

    case 'wave_2_starting':
      return { ...state, ...evBase };

    case 'audit_started':
      return { ...state, status: 'auditing', ...evBase };

    case 'swarm_completed': {
      const result = typeof payload?.result === 'string' ? payload.result : null;
      return { ...state, status: 'completed', result, ...evBase };
    }

    case 'swarm_failed': {
      const error =
        typeof payload?.error === 'string'
          ? payload.error
          : typeof payload?.message === 'string'
          ? payload.message
          : 'An unknown error occurred.';
      return { ...state, status: 'failed', error, ...evBase };
    }

    case 'swarm_cancelled':
      return { ...state, status: 'cancelled', ...evBase };

    case 'stream_end':
      return { ...state, connected: false, ...evBase };

    case 'disconnect':
      return { ...state, connected: false };

    default:
      return state;
  }
}

// ─── Initialiser ──────────────────────────────────────────────────────────────

function buildInitialState(run: SwarmRun, initialMembers: SwarmMember[]): SwarmState {
  const members: Record<string, Partial<SwarmMember>> = {};
  for (const m of initialMembers) {
    members[m.id] = m;
  }

  return {
    status: run.status,
    members,
    events: [],
    result: run.result,
    planTaskCount: run.plan?.tasks.length ?? null,
    error: run.errorMessage,
    connected: false,
    thinking: {},
  };
}

// ─── Status badge ─────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  const base = 'inline-flex text-xs font-medium rounded-full px-2.5 py-0.5 leading-none items-center';

  if (status === 'queued' || status === 'planning') {
    return <span className={cn(base, 'bg-muted text-muted-foreground')}>{status}</span>;
  }
  if (status === 'running') {
    return (
      <span className={cn(base, 'bg-blue-500/10 text-blue-600 dark:text-blue-400')}>running</span>
    );
  }
  if (status === 'auditing') {
    return <span className={cn(base, 'bg-amber-500/10 text-amber-600 dark:text-amber-400')}>auditing</span>;
  }
  if (status === 'completed') {
    return (
      <span className={cn(base, 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400')}>
        completed
      </span>
    );
  }
  if (status === 'failed' || status === 'cancelled') {
    return <span className={cn(base, 'bg-destructive/10 text-destructive')}>{status}</span>;
  }
  return <span className={cn(base, 'bg-muted text-muted-foreground')}>{status}</span>;
}

// ─── Connection indicator ─────────────────────────────────────────────────────

function ConnectionDot({ connected }: { connected: boolean }) {
  return (
    <span
      className={cn(
        'flex-shrink-0 w-1.5 h-1.5 rounded-full',
        connected ? 'bg-emerald-500 animate-pulse' : 'bg-muted-foreground/30',
      )}
      title={connected ? 'Live stream connected' : 'Disconnected'}
    />
  );
}

// ─── SSE event types ──────────────────────────────────────────────────────────

const SSE_TYPES: SwarmEventType[] = [
  'connected',
  'swarm_planning',
  'plan_created',
  'agent_started',
  'agent_thinking',
  'agent_completed',
  'agent_failed',
  'wave_2_starting',
  'audit_started',
  'swarm_completed',
  'swarm_failed',
  'swarm_cancelled',
  'stream_end',
];

// ─── Agent card stagger variants ──────────────────────────────────────────────

const CARD_CONTAINER_VARIANTS = {
  hidden: {},
  visible: {
    transition: { staggerChildren: 0.07 },
  },
};

const CARD_ITEM_VARIANTS = {
  hidden: { opacity: 0, y: 12 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: DURATION_BASE, ease: EASE_OUT },
  },
};

// ─── Props ────────────────────────────────────────────────────────────────────

interface SwarmMonitorProps {
  runId: string;
  initialRun: SwarmRun;
  initialMembers: SwarmMember[];
  slug: string;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function SwarmMonitor({ runId, initialRun, initialMembers, slug: _slug }: SwarmMonitorProps) {
  const [state, dispatch] = useReducer(reducer, undefined, () =>
    buildInitialState(initialRun, initialMembers),
  );

  const esRef = useRef<EventSource | null>(null);

  // Only open SSE stream when the run is still in-progress
  const isTerminal =
    initialRun.status === 'completed' ||
    initialRun.status === 'failed' ||
    initialRun.status === 'cancelled';

  useEffect(() => {
    if (isTerminal) return;

    const es = new EventSource(`/api/swarm/${runId}/stream`);
    esRef.current = es;

    SSE_TYPES.forEach((evType) => {
      es.addEventListener(evType, (e: MessageEvent) => {
        let data: Record<string, unknown> = {};
        try {
          data = JSON.parse(e.data);
        } catch {
          // non-JSON payload — ignore
        }
        dispatch({ type: evType as SwarmAction['type'], payload: data } as SwarmAction);
      });
    });

    es.onerror = () => {
      dispatch({ type: 'disconnect' });
      // The browser will retry automatically for transient errors.
      // Only close on terminal states (handled in reducer).
    };

    return () => {
      es.close();
      esRef.current = null;
    };
  }, [runId, isTerminal]);

  // Close stream once terminal event arrives
  useEffect(() => {
    if (
      (state.status === 'completed' || state.status === 'failed' || state.status === 'cancelled') &&
      esRef.current
    ) {
      esRef.current.close();
      esRef.current = null;
    }
  }, [state.status]);

  const memberList = Object.values(state.members);
  const isTerminalState =
    state.status === 'completed' || state.status === 'failed' || state.status === 'cancelled';

  return (
    <div className="space-y-8 pb-12">
      {/* ── Page header ── */}
      <header className="space-y-1.5">
        <div className="flex items-center gap-2">
          <p className={cn(BODY_MUTED)}>Swarm run.</p>
          <ConnectionDot connected={state.connected} />
        </div>
        <h1
          className="text-3xl tracking-tight text-foreground"
          style={TITLE_FONT}
        >
          {initialRun.goal.length > 80
            ? `${initialRun.goal.slice(0, 80)}…`
            : initialRun.goal}
        </h1>
        <div className="flex items-center gap-2 pt-0.5">
          <StatusBadge status={state.status} />
          {state.planTaskCount != null && (
            <p className={CAPTION}>{state.planTaskCount} tasks planned</p>
          )}
        </div>
      </header>

      {/* ── Agent grid ── */}
      {memberList.length > 0 && (
        <section className="space-y-3">
          <p className={cn(SECTION_LABEL)}>Agents</p>
          <motion.div
            className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3"
            variants={CARD_CONTAINER_VARIANTS}
            initial="hidden"
            animate="visible"
          >
            <AnimatePresence>
              {memberList.map((member, idx) => (
                <motion.div
                  key={member.id ?? member.name}
                  variants={CARD_ITEM_VARIANTS}
                  layout
                >
                  <SwarmAgentCard
                    name={member.name ?? 'Agent'}
                    role={member.role ?? null}
                    task={member.task ?? ''}
                    status={(member.status ?? 'queued') as import('@/lib/swarm-types').MemberStatus}
                    output={member.output ?? null}
                    thinkingMessage={member.id ? (state.thinking[member.id] ?? null) : null}
                    animationDelay={idx * 0.05}
                  />
                </motion.div>
              ))}
            </AnimatePresence>
          </motion.div>
        </section>
      )}

      {/* ── Empty agent state while planning ── */}
      {memberList.length === 0 && (state.status === 'planning' || state.status === 'queued') && (
        <div className="rounded-xl border border-dashed border-border/70 bg-muted/20 px-5 py-10 text-center">
          <p className="text-sm text-foreground">
            {state.status === 'planning' ? 'Planning agents…' : 'Queued.'}
          </p>
          <p className={cn(CAPTION, 'mt-1')}>Agents appear here once the plan is ready.</p>
        </div>
      )}

      {/* ── Timeline + Output (two-column on lg+) ── */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_1.4fr] gap-8">
        {/* Timeline — hidden on mobile, visible lg+ */}
        <section className="hidden lg:block space-y-3 min-w-0">
          <SwarmTimeline events={state.events} />
        </section>

        {/* Output panel */}
        <section className="min-w-0 space-y-3">
          <AnimatePresence mode="wait">
            {isTerminalState ? (
              <motion.div
                key="output-terminal"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1, transition: { duration: DURATION_BASE, ease: EASE_OUT } }}
                exit={{ opacity: 0 }}
              >
                <SwarmOutputPanel
                  result={state.status === 'failed' ? (state.error ?? '') : (state.result ?? '')}
                  status={state.status}
                />
              </motion.div>
            ) : (
              <motion.div key="output-pending">
                <SwarmOutputPanel
                  result={state.result ?? ''}
                  status={state.status}
                />
              </motion.div>
            )}
          </AnimatePresence>
        </section>
      </div>

      {/* ── Timeline visible on mobile (below output) ── */}
      <section className="lg:hidden space-y-3">
        <SwarmTimeline events={state.events} />
      </section>
    </div>
  );
}
