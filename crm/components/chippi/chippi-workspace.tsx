'use client';

import { useState, useRef, useEffect, useCallback, useMemo, useTransition } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { ConversationSidebar } from '@/components/ai/conversation-sidebar';
import { ChippiPromptBox, type MentionItem, type SkillItem } from '@/components/ui/chippi-prompt-box';
import { Button } from '@/components/ui/button';
import { History, X, AlertCircle, Mic, Settings, ArrowLeft, Play, Loader2, NotebookText, RotateCcw, MoreHorizontal, SquarePen } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { VoiceMode } from '@/components/ai/voice-mode';
import { Transcript } from '@/components/ai/blocks/transcript';
import { ThinkingIndicator } from '@/components/ai/blocks/thinking-indicator';
import { SuggestedActions } from '@/components/ai/blocks/suggested-actions';
import { useAgentTask, type UiMessage } from '@/components/ai/hooks/use-agent-task';
import { blocksFromLegacyContent, type MessageBlock, type ToolCallBlock } from '@/lib/ai-tools/blocks';
import { getSuggestionsForTurn } from '@/lib/ai-tools/suggestions';
import type { Conversation } from '@/lib/types';
import { useUser } from '@clerk/nextjs';
import { AgentSettingsPanel } from '@/components/agent/agent-settings-panel';
import { toast } from 'sonner';
import { approvalKindForTool, approvalSubjectFromArgs, type ApprovalKind } from './approval-celebration';
import { PlanCard } from '@/components/chippi/plan-card';
import { useSplitPanel } from '@/hooks/use-split-panel';
import { SplitPanelToggle } from '@/components/chippi/split-panel-toggle';
import { RightPanel } from '@/components/chippi/right-panel';
import { PanelResizeHandle } from '@/components/chippi/panel-resize-handle';
import { ApprovalsPill } from '@/components/chippi/approvals-pill';

/**
 * Legacy on-the-wire message shape from /api/ai/messages. The DB now also
 * carries `blocks` (Phase 3a migration); when present we prefer it, falling
 * back to rendering `content` as a single text block.
 */
interface LegacyMessage {
  role: 'user' | 'assistant';
  content: string;
  blocks?: MessageBlock[] | null;
}

interface ChippiWorkspaceProps {
  slug: string;
  /** When 'settings', renders the agent settings panel instead of the workspace. */
  view?: 'workspace' | 'settings';
  initialMessages: LegacyMessage[];
  initialConversations: Conversation[];
  initialConversationId: string | null;
  /** Pre-send this message on mount (used when arriving from the command palette). */
  initialInput?: string;
  /** Pre-populate the composer on mount but do NOT auto-send — the realtor
   *  finishes the sentence themselves. Used by "or just tell Chippi →"
   *  shortcuts on /contacts and /deals, and by morning-actions. Distinct
   *  from `initialInput` which auto-sends. */
  initialPrefill?: string;
  /** When true, render the "Connect Gmail to send your drafts →" tertiary
   *  line under the post-tour affordance. Snapshot at page load: the realtor
   *  has zero active integrations AND Composio is configured. Once they
   *  connect, the OAuth round-trip reloads the page and this flips false. */
  showConnectBanner?: boolean;
  /** Skills offered in the chat's `/` menu. From loadUserInvocableSkills(). */
  skills?: SkillItem[];
}

const MESSAGE_LIMIT = 50;

/**
 * Parse a create_plan tool call result into { task, steps }.
 * Returns null if the data doesn't match the expected shape.
 */
function parsePlanResult(
  data: unknown,
): { task: string; steps: Array<{ title: string; description: string }> } | null {
  if (!data || typeof data !== 'object') return null;
  const d = data as Record<string, unknown>;
  const task = typeof d.task === 'string' ? d.task : null;
  const steps = Array.isArray(d.steps) ? d.steps : null;
  if (!task || !steps) return null;
  const parsedSteps = steps.map((s: unknown) => {
    if (!s || typeof s !== 'object') return { title: '', description: '' };
    const step = s as Record<string, unknown>;
    return {
      title: typeof step.title === 'string' ? step.title : '',
      description: typeof step.description === 'string' ? step.description : '',
    };
  });
  return { task, steps: parsedSteps };
}

function legacyToUi(messages: LegacyMessage[]): UiMessage[] {
  return messages.map((m, i) => ({
    id: `hist_${i}`,
    role: m.role === 'assistant' ? 'assistant' : 'user',
    blocks:
      Array.isArray(m.blocks) && m.blocks.length > 0
        ? m.blocks
        : blocksFromLegacyContent(typeof m.content === 'string' ? m.content : ''),
  }));
}

export function ChippiWorkspace({
  slug,
  view = 'workspace',
  initialMessages,
  initialConversations,
  initialConversationId,
  initialInput,
  initialPrefill,
  showConnectBanner = false,
  skills = [],
}: ChippiWorkspaceProps) {
  const { user } = useUser();
  const router = useRouter();
  const [conversations, setConversations] = useState<Conversation[]>(initialConversations);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(
    initialConversationId,
  );
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [voiceOpen, setVoiceOpen] = useState(false);
  // Server-driven loading: pending during the soft-nav so we can show the
  // "One moment" placeholder instead of the previous conversation's
  // transcript flashing for a beat. `useTransition` is the natural fit —
  // wrap the `router.push` calls and the `isPending` flag flips for the
  // duration of the server re-render.
  const [isLoadingConversation, startConversationTransition] = useTransition();
  // The single sentence the realtor sees when they approve a celebrate-able
  // tool from the chat permission prompt. Set the moment the wrapped
  // approve/alwaysAllow callback fires; cleared by the celebration's own
  // onDone after the dwell. Anchored to the assistant message id whose
  // permission prompt was approved so a later turn's prompt can't inherit it.
  const [chatCelebration, setChatCelebration] = useState<
    { messageId: string; kind: ApprovalKind; subject?: string } | null
  >(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const { isSplit, toggle: toggleSplit, rightTab, setRightTab, leftWidthPercent, setLeftWidthPercent } = useSplitPanel();

  // (no per-plan animation state needed — isAnimating is derived from the
  //  message's streaming flag, which already tracks live vs. settled.)

  const {
    messages,
    setMessages,
    isStreaming,
    pendingApproval,
    liveCallIds,
    error: agentError,
    streamingReasoning,
    activePlan,
    send,
    approve,
    deny,
    alwaysAllow,
    abort,
  } = useAgentTask({
    spaceSlug: slug,
    conversationId: activeConversationId,
    onConversationCreated: (id) => {
      setActiveConversationId(id);
      // Mark as loaded so the conversation-loading effect won't try to
      // re-fetch when the URL update below arrives (messages are already
      // in the UI from the optimistic send).
      loadedConvIdRef.current = id;
      // Minimal placeholder — the sidebar picks up the real title on refresh,
      // and `send` already titled the conversation server-side.
      setConversations((prev) =>
        prev.some((c) => c.id === id)
          ? prev
          : [
              {
                id,
                spaceId: '',
                title: 'New conversation',
                createdAt: new Date(),
                updatedAt: new Date(),
              } as Conversation,
              ...prev,
            ],
      );
      // Reflect the new conversation in the URL so a refresh (or share)
      // lands on the same transcript. `replace` so the history doesn't
      // grow a step for every new chat.
      router.replace(`/s/${slug}/chippi?conversationId=${id}`, { scroll: false });
    },
  });

  // ── Retry support ────────────────────────────────────────────────────────
  // Store the last user message so the retry button can re-send it without
  // the user having to retype. Populated on every send() call.
  const lastUserMsgRef = useRef<string>('');

  // retryLastMessage — re-send the last user message. Falls back to the ref
  // when the hook doesn't export retryLastMessage (current state of the hook).
  const retryLastMessage = useCallback(async () => {
    if (!lastUserMsgRef.current || isStreaming) return;
    await send(lastUserMsgRef.current);
  }, [send, isStreaming]);

  // ── Rate-limit countdown ──────────────────────────────────────────────────
  // When the hook surfaces a rate_limited error, start a local 60-second
  // countdown so the composer shows "Ready in 0:59…" feedback.
  const RATE_LIMIT_TEXT = "You've been moving fast";
  const [rateLimitSeconds, setRateLimitSeconds] = useState(0);
  const rateLimitTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (agentError && agentError.includes(RATE_LIMIT_TEXT)) {
      // Clear any existing timer before starting a fresh one.
      if (rateLimitTimerRef.current) clearInterval(rateLimitTimerRef.current);
      setRateLimitSeconds(60);
      rateLimitTimerRef.current = setInterval(() => {
        setRateLimitSeconds((s) => {
          if (s <= 1) {
            if (rateLimitTimerRef.current) clearInterval(rateLimitTimerRef.current);
            rateLimitTimerRef.current = null;
            return 0;
          }
          return s - 1;
        });
      }, 1000);
    }
  }, [agentError]);

  // Clean up the interval on unmount.
  useEffect(() => {
    return () => {
      if (rateLimitTimerRef.current) clearInterval(rateLimitTimerRef.current);
    };
  }, []);

  // Wrap approve / alwaysAllow so the moment the realtor approves a
  // celebrate-able tool, the prompt's surface flips into the win sentence.
  // The wrapped callbacks fire-and-forget the underlying action (the hook
  // already kicks off the continuation stream synchronously) and stamp
  // `chatCelebration` with the *current* tail assistant message id so the
  // line lands on the same bubble that asked for approval.
  function celebrateThen<
    F extends (requestId: string, editedArgs?: Record<string, unknown>) => Promise<void>,
  >(fn: F): F {
    return ((requestId, editedArgs) => {
      // Snapshot before the hook clears pendingApproval.
      const prompt = pendingApproval;
      if (prompt) {
        const kind = approvalKindForTool(prompt.name);
        if (kind) {
          // Find the assistant message the prompt sits under — it's the tail.
          const tail = [...messages].reverse().find((m) => m.role === 'assistant');
          if (tail) {
            setChatCelebration({
              messageId: tail.id,
              kind,
              subject: approvalSubjectFromArgs(prompt.name, prompt.args),
            });
          }
        }
      }
      return fn(requestId, editedArgs);
    }) as F;
  }
  const approveCelebrating = celebrateThen(approve);
  const alwaysAllowCelebrating = celebrateThen(alwaysAllow);

  // ── Conversation loading ─────────────────────────────────────────────────
  //
  // Single source of truth: the URL's `?conversationId=` param.
  //
  // When the URL changes (sidebar click, new conversation, etc.) we load the
  // matching messages. On initial mount we prefer the server-provided
  // initialMessages (already fetched server-side) to avoid a redundant
  // round-trip. When the server props are stale or empty we fall back to a
  // client fetch from /api/ai/messages.
  //
  // loadedConvIdRef guards against re-loading the same conversation twice
  // (e.g. when React fires the effect after an unrelated state change, or
  // when onConversationCreated updates the URL to the just-created conv).
  const searchParams = useSearchParams();
  const urlConversationId = searchParams.get('conversationId');
  const loadedConvIdRef = useRef<string | null>(null);

  // Deep-link to history: ?view=history (used by the collapsed sidebar's
  // Chats icon) opens the conversation-history drawer on mount, then
  // cleans the URL so a back/refresh doesn't re-trigger it.
  useEffect(() => {
    if (searchParams.get('view') === 'history') {
      setDrawerOpen(true);
      const next = new URLSearchParams(searchParams.toString());
      next.delete('view');
      const qs = next.toString();
      router.replace(`/s/${slug}/chippi${qs ? `?${qs}` : ''}`, { scroll: false });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadConversation = useCallback(
    async (convId: string) => {
      try {
        const res = await fetch(`/api/ai/messages?conversationId=${convId}`);
        if (!res.ok) {
          const errBody = await res.text().catch(() => '');
          console.error('[Chat] fetch failed', res.status, errBody);
          toast.error("Couldn't load that conversation.", {
            action: { label: 'Retry', onClick: () => void loadConversation(convId) },
          });
          return;
        }
        const data = (await res.json()) as LegacyMessage[];
        setMessages(legacyToUi(data));
      } catch (err) {
        console.error('[Chat] fetch error', err);
        toast.error("Couldn't load that conversation.", {
          action: { label: 'Retry', onClick: () => void loadConversation(convId) },
        });
      }
    },
    [setMessages],
  );

  useEffect(() => {
    if (isStreaming) return;

    // Determine which conversation the user should see right now.
    // URL is authoritative; fall back to what the server pre-loaded.
    const targetId = urlConversationId ?? initialConversationId ?? null;
    if (!targetId) {
      // No conversation at all — ensure empty state.
      if (loadedConvIdRef.current !== '') {
        loadedConvIdRef.current = '';
        setActiveConversationId(null);
        setMessages([]);
      }
      return;
    }

    // Already showing this conversation — nothing to do.
    if (targetId === loadedConvIdRef.current) return;

    loadedConvIdRef.current = targetId;
    setActiveConversationId(targetId);

    // Server already fetched the right messages for this exact conversation —
    // use them immediately (zero extra round-trip).
    if (targetId === initialConversationId && initialMessages.length > 0) {
      setMessages(legacyToUi(initialMessages));
      return;
    }

    // Server props are empty or stale (e.g. router-cache served an old render,
    // or this is a conversation outside the server's top-50 list). Fetch fresh.
    void loadConversation(targetId);
  }, [urlConversationId, initialConversationId, initialMessages, isStreaming, loadConversation, setMessages]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, pendingApproval, isStreaming]);

  function handleSelectConversation(conv: Conversation) {
    setDrawerOpen(false);
    if (conv.id === activeConversationId) return;
    startConversationTransition(() => {
      router.push(`/s/${slug}/chippi?conversationId=${conv.id}`, { scroll: false });
    });
  }

  async function handleNewConversation() {
    const res = await fetch('/api/ai/conversations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ slug }),
    });
    if (res.ok) {
      const conv = (await res.json()) as Conversation;
      setConversations((prev) => [conv, ...prev]);
      setDrawerOpen(false);
      startConversationTransition(() => {
        router.push(`/s/${slug}/chippi?conversationId=${conv.id}`, { scroll: false });
      });
    }
  }

  async function handleDeleteConversation(id: string) {
    try {
      const res = await fetch(`/api/ai/conversations/${id}`, { method: 'DELETE' });
      if (!res.ok) {
        console.error('[Chat] Failed to delete conversation:', res.status);
        return;
      }
      setConversations((prev) => prev.filter((c) => c.id !== id));
      if (activeConversationId === id) {
        startConversationTransition(() => {
          router.push(`/s/${slug}/chippi`, { scroll: false });
        });
      }
    } catch (err) {
      console.error('[Chat] Error deleting conversation:', err);
    }
  }

  async function handleRenameConversation(id: string, title: string) {
    const res = await fetch(`/api/ai/conversations/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title }),
    });
    if (res.ok) {
      const updated = (await res.json()) as Conversation;
      setConversations((prev) => prev.map((c) => (c.id === id ? updated : c)));
    }
  }

  const handleMentionSearch = useCallback(
    async (query: string): Promise<MentionItem[]> => {
      const results: MentionItem[] = [];
      try {
        const [contactsRes, dealsRes] = await Promise.all([
          fetch(`/api/contacts?slug=${encodeURIComponent(slug)}&search=${encodeURIComponent(query)}`),
          fetch(`/api/deals?slug=${encodeURIComponent(slug)}`),
        ]);

        if (contactsRes.ok) {
          const contacts = await contactsRes.json();
          for (const c of contacts.slice(0, 10)) {
            results.push({
              id: c.id,
              type: 'contact',
              label: c.name,
              subtitle: c.email || c.phone || undefined,
            });
          }
        }

        if (dealsRes.ok) {
          const deals = await dealsRes.json();
          const lowerQuery = query.toLowerCase();
          const filtered = lowerQuery
            ? deals.filter((d: { title: string }) => d.title.toLowerCase().includes(lowerQuery))
            : deals;
          for (const d of filtered.slice(0, 10)) {
            results.push({
              id: d.id,
              type: 'deal',
              label: d.title,
              subtitle: d.value ? `$${Number(d.value).toLocaleString()}` : d.address || undefined,
            });
          }
        }
      } catch (err) {
        console.error('[Chat] Mention search failed:', err);
      }
      return results;
    },
    [slug],
  );

  const handleSend = useCallback(
    async (text: string, mentions: MentionItem[], attachmentIds?: string[]) => {
      const hasAttachments = Array.isArray(attachmentIds) && attachmentIds.length > 0;
      if (!text && !hasAttachments) return;
      let contextPrefix = '';
      if (mentions.length > 0) {
        const labels = mentions.map(
          (m) => `[${m.type === 'contact' ? 'Contact' : 'Deal'}: ${m.label}]`,
        );
        contextPrefix = `(Referencing: ${labels.join(', ')})\n\n`;
      }

      // Record the full text so the retry button can replay it.
      lastUserMsgRef.current = contextPrefix + text;

      await send(contextPrefix + text, attachmentIds);

      // Bump the sidebar's conversation ordering.
      const cid = activeConversationId;
      if (cid) {
        setConversations((prev) => {
          const conv = prev.find((c) => c.id === cid);
          if (!conv) return prev;
          return [{ ...conv, updatedAt: new Date() }, ...prev.filter((c) => c.id !== cid)];
        });
      }
    },
    [send, activeConversationId],
  );

  // Auto-send when arriving from the command palette via ?q= — fires once on
  // mount only. handleSendRef lets us read the latest handleSend without
  // adding it to the deps array (which would re-trigger on every send).
  const autoSentRef = useRef(false);
  const handleSendRef = useRef(handleSend);
  useEffect(() => { handleSendRef.current = handleSend; }, [handleSend]);
  useEffect(() => {
    if (initialInput && initialMessages.length === 0 && !autoSentRef.current) {
      autoSentRef.current = true;
      void handleSendRef.current(initialInput, []);
    }
    // Intentionally empty deps — this must fire exactly once on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const atLimit = messages.length >= MESSAGE_LIMIT;
  const isEmpty = messages.length === 0 && !isLoadingConversation;
  const firstName = user?.firstName ?? '';

  // Time-of-day greeting for the empty-state hero. Computed client-side
  // (the server doesn't know the realtor's local hour); we render an
  // invisible non-breaking space until the hour is set so the heading
  // doesn't collapse and bump the composer up on first paint.
  const [hour, setHour] = useState<number | null>(null);
  useEffect(() => {
    setHour(new Date().getHours());
  }, []);
  const greeting = (() => {
    if (hour === null) return '';
    const name = firstName.trim();
    if (hour >= 5 && hour < 12) return name ? `Good morning, ${name}` : 'Good morning';
    if (hour >= 12 && hour < 19) return name ? `Good afternoon, ${name}` : 'Good afternoon';
    return 'Working late?';
  })();

  // Composer prefill — bumped by the day-one welcome's "Tell me about a lead"
  // action, and seeded on mount when arriving from `?prefill=` (the
  // "or just tell Chippi →" shortcuts on /contacts and /deals, and
  // morning-actions). Nonce so identical text twice in a row still re-applies.
  const [prefill, setPrefill] = useState<{ text: string; nonce: number } | null>(
    initialPrefill ? { text: initialPrefill, nonce: Date.now() } : null,
  );
  const handleTellMeAboutLead = useCallback((text: string) => {
    setPrefill({ text, nonce: Date.now() });
  }, []);

  // Counts for the header status sentence. Fetch only when we're rendering
  // the today view — no point pinging while in an active conversation. The
  // child sections still self-fetch their own data; this is a lightweight
  // duplicate read for a one-line summary.
  const [counts, setCounts] = useState<{ drafts: number; questions: number }>({
    drafts: 0,
    questions: 0,
  });
  const [countsLoaded, setCountsLoaded] = useState(false);
  useEffect(() => {
    if (!isEmpty) return;
    const controller = new AbortController();
    void (async () => {
      try {
        const [draftsRes, questionsRes] = await Promise.all([
          fetch('/api/agent/drafts?status=pending&limit=50', { signal: controller.signal }),
          fetch('/api/agent/questions?status=pending&limit=50', { signal: controller.signal }),
        ]);
        const drafts = draftsRes.ok ? await draftsRes.json() : [];
        const questions = questionsRes.ok ? await questionsRes.json() : [];
        setCounts({
          drafts: Array.isArray(drafts) ? drafts.length : 0,
          questions: Array.isArray(questions) ? questions.length : 0,
        });
      } catch {
        // non-critical — header just falls back to a generic line
      } finally {
        setCountsLoaded(true);
      }
    })();
    return () => controller.abort();
  }, [isEmpty]);

  // Day-one signal: zero of everything. The realtor has truly never engaged.
  // We wait for `countsLoaded` so we don't flash the welcome before we know
  // whether there's pending work. `messages.length === 0` is implied by
  // `isEmpty`; checking it twice is cheap and explicit.
  const isFresh =
    isEmpty &&
    countsLoaded &&
    messages.length === 0 &&
    counts.drafts === 0 &&
    counts.questions === 0 &&
    conversations.length === 0;

  // Run Now — kicks off a background sweep and tells the user via toast.
  const [running, setRunning] = useState(false);
  async function handleRunNow() {
    setRunning(true);
    try {
      const res = await fetch('/api/agent/run-now', { method: 'POST' });
      const data = res.ok ? await res.json() : null;
      if (res.ok && data?.triggered) {
        toast.success(
          data.method === 'modal'
            ? "On it. New drafts will land here."
            : "Queued. I'll pick it up on the next sweep (~15 min).",
        );
      } else {
        toast.error("Couldn't kick myself off. Try again.");
      }
    } catch {
      toast.error("I lost the connection. Try again.");
    } finally {
      setRunning(false);
    }
  }

  // The trailing assistant message — used to detect the "thinking" state
  // and to pin the permission prompt at the end of the transcript.
  const tailMessage = useMemo(() => messages[messages.length - 1] ?? null, [messages]);
  // The indicator block (avatar + shimmer line + optional plan card) only
  // renders when there's actually something to show. `currentAction` is
  // computed below and falls back to "Thinking…" during the dead air
  // before the first token, so this gate is effectively:
  //   "we're streaming AND we have a status to communicate."
  // Once real assistant text starts flowing, currentAction → null and
  // the indicator slides out — the chat bubble takes over.

  // Map in-flight tool call names to human-readable status phrases.
  const TOOL_ACTION_MAP: Record<string, string> = {
    search_contacts: 'Searching your contacts…',
    find_person: 'Searching your contacts…',
    get_contact: 'Looking up contact…',
    pipeline_summary: 'Analyzing your pipeline…',
    find_stuck_deals: 'Analyzing your pipeline…',
    find_deal: 'Looking up deals…',
    search_deals: 'Looking up deals…',
    schedule_tour: 'Checking the calendar…',
    reschedule_tour: 'Checking the calendar…',
    find_tours: 'Checking the calendar…',
    send_email: 'Drafting your email…',
    draft_email: 'Drafting your email…',
    send_sms: 'Drafting your message…',
    draft_sms: 'Drafting your message…',
    recall_history: 'Checking history…',
    set_followup: 'Updating follow-up…',
    clear_followup: 'Updating follow-up…',
    create_deal: 'Updating deal…',
    mark_deal_won: 'Updating deal…',
    mark_deal_lost: 'Updating deal…',
    note_on_person: 'Adding note…',
    note_on_deal: 'Adding note…',
    planner: 'Building a plan…',
    create_plan: 'Building a plan…',
  };

  // Best-effort: map tool name keywords to which plan step is likely active.
  // Matches on lower-cased step title. Not guaranteed to be exact — just a
  // visual hint while the agent is running.
  const TOOL_STEP_KEYWORDS: Record<string, string[]> = {
    search_contacts: ['contact'],
    find_contacts: ['contact'],
    find_person: ['contact'],
    get_contact: ['contact'],
    send_email: ['email', 'draft'],
    draft_email: ['email', 'draft'],
    send_sms: ['sms', 'message', 'text'],
    draft_sms: ['sms', 'message', 'text'],
    advance_deal_stage: ['deal', 'stage'],
    create_deal: ['deal'],
    mark_deal_won: ['deal'],
    mark_deal_lost: ['deal'],
    find_deal: ['deal'],
    search_deals: ['deal'],
    find_stuck_deals: ['deal'],
    pipeline_summary: ['pipeline', 'deal'],
    schedule_tour: ['tour', 'calendar', 'schedule'],
    reschedule_tour: ['tour', 'calendar', 'schedule'],
    find_tours: ['tour', 'calendar'],
    set_followup: ['follow'],
    clear_followup: ['follow'],
    recall_history: ['history', 'note'],
    note_on_person: ['note'],
    note_on_deal: ['note'],
  };

  const activePlanStepIndex = useMemo<number | undefined>(() => {
    if (!tailMessage || !liveCallIds || liveCallIds.size === 0) return undefined;
    // Find the name of the currently live tool call.
    let liveToolName: string | undefined;
    for (const block of tailMessage.blocks) {
      if (
        block.type === 'tool_call' &&
        'callId' in block &&
        liveCallIds.has((block as { callId: string }).callId)
      ) {
        liveToolName = (block as { name: string }).name;
        break;
      }
    }
    if (!liveToolName) return undefined;
    // Find the plan (create_plan) block in the same message to get step list.
    const planBlock = tailMessage.blocks.find(
      (b): b is ToolCallBlock => b.type === 'tool_call' && (b as ToolCallBlock).name === 'create_plan',
    );
    if (!planBlock) return undefined;
    const plan = parsePlanResult(planBlock.result?.data ?? planBlock.args);
    if (!plan) return undefined;
    // Match the live tool name against step titles via keywords.
    const keywords = TOOL_STEP_KEYWORDS[liveToolName] ?? [];
    if (keywords.length === 0) return undefined;
    const matchIndex = plan.steps.findIndex((s) =>
      keywords.some((kw) => s.title.toLowerCase().includes(kw)),
    );
    return matchIndex >= 0 ? matchIndex : undefined;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tailMessage, liveCallIds]);

  const currentAction = useMemo<string | null>(() => {
    if (!isStreaming || !tailMessage) return null;
    // Live tool call → its action verb wins.
    if (liveCallIds && liveCallIds.size > 0) {
      for (const block of tailMessage.blocks) {
        if (
          block.type === 'tool_call' &&
          'callId' in block &&
          liveCallIds.has((block as { callId: string }).callId)
        ) {
          const name = (block as { name: string }).name;
          if (TOOL_ACTION_MAP[name]) return TOOL_ACTION_MAP[name];
          // Composio toolkit-prefixed slugs (HUBSPOT_*, GMAIL_*, SLACK_*, …)
          // get a friendly verb derived from the toolkit name so realtors
          // don't see raw SDK slugs in the status line.
          const prefix = name.split('_')[0];
          if (prefix === 'HUBSPOT') return 'Reading HubSpot…';
          if (prefix === 'GMAIL') return 'Reading Gmail…';
          if (prefix === 'SLACK') return 'Talking to Slack…';
          if (prefix === 'GOOGLECALENDAR' || prefix === 'GOOGLE') return 'Checking your calendar…';
          if (prefix === 'NOTION') return 'Reading Notion…';
          if (prefix === 'LINEAR') return 'Reading Linear…';
          if (prefix === 'GITHUB') return 'Reading GitHub…';
          return 'Working on it…';
        }
      }
    }
    // Streaming, no tool call active, no tokens yet → still warming up the
    // container / fetching tools / waiting on first model token. Fill the
    // dead air with a single calm status so the realtor knows Chippi is on
    // it, not stuck.
    const hasText = tailMessage.blocks.some(
      (b) => b.type === 'text' && b.content.trim().length > 0,
    );
    if (!hasText) return 'Thinking…';
    return null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isStreaming, tailMessage, liveCallIds]);

  // Final visibility gate for the indicator block — we want the avatar +
  // shimmer line + plan card only when there's actually something to
  // communicate, otherwise the row would render hollow once real text starts
  // flowing into the assistant bubble below.
  const showThinking =
    isStreaming &&
    tailMessage?.role === 'assistant' &&
    (Boolean(currentAction) || Boolean(streamingReasoning?.trim()) || Boolean(activePlan));

  // Reusable input — shared between the empty hero and the docked footer
  // so the focal point lives wherever it should. The `/` skills menu lives
  // inside ChippiPromptBox itself.
  const renderInput = () => (
    <div>
      <ChippiPromptBox
        placeholder="Message Chippi, or press / for skills…"
        onSend={handleSend}
        onMentionSearch={handleMentionSearch}
        onVoiceStart={() => setVoiceOpen(true)}
        onAbort={abort}
        disabled={isStreaming || pendingApproval !== null || rateLimitSeconds > 0}
        isLoading={isStreaming}
        prefill={prefill ?? undefined}
        skills={skills}
      />
      {/* Rate-limit countdown — shown below the composer when the API is
          throttling. Counts down from 60 s and disappears automatically. */}
      {rateLimitSeconds > 0 && (
        <p className="text-xs text-muted-foreground/70 text-center py-2">
          Ready in {Math.floor(rateLimitSeconds / 60)}:{String(rateLimitSeconds % 60).padStart(2, '0')}
        </p>
      )}
    </div>
  );

  // Settings view — entirely separate surface; no chat input, no today feed.
  if (view === 'settings') {
    return (
      <div className="relative flex flex-col h-full min-h-0 overflow-y-auto">
        <div className="max-w-3xl w-full mx-auto px-4 sm:px-6 py-8 space-y-6">
          <div className="flex items-center justify-between">
            <div className="space-y-1.5">
              <Link
                href={`/s/${slug}/chippi`}
                className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                <ArrowLeft size={12} />
                Back to Chippi
              </Link>
              <h1
                className="text-3xl tracking-tight text-foreground"
                style={{ fontFamily: 'var(--font-title)' }}
              >
                Settings
              </h1>
              <p className="text-sm text-muted-foreground">
                Tune what Chippi does on its own and what it brings to you.
              </p>
            </div>
          </div>
          <AgentSettingsPanel slug={slug} />
        </div>
      </div>
    );
  }

  return (
    <div className="relative flex flex-col h-full min-h-0">
      {/* Floating control cluster — top-right, no top bar chrome */}
      <div className="absolute top-1.5 right-2 sm:top-2 sm:right-3 z-20 flex items-center gap-0.5">
        <ApprovalsPill />
        {messages.length >= MESSAGE_LIMIT * 0.8 && (
          <span className="hidden sm:inline text-[11px] tabular-nums text-amber-600 dark:text-amber-400 font-semibold px-2">
            {messages.length}/{MESSAGE_LIMIT}
          </span>
        )}
        {isEmpty && (
          <button
            type="button"
            onClick={() => void handleRunNow()}
            disabled={running}
            className="inline-flex items-center gap-1.5 mr-1 h-8 px-2.5 rounded-lg text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors disabled:opacity-50"
            title="Run Chippi now"
          >
            {running ? <Loader2 size={12} className="animate-spin" /> : <Play size={12} />}
            <span className="hidden sm:inline">Run now</span>
          </button>
        )}
        {/* New chat — the discoverable affordance. Sits left of History so
            the pair reads as "new ↔ old" — the same convention iMessage
            and the major chat apps use. Pre-rebuild this only existed as
            an opaque link inside the sidebar's conversation list, which
            wasn't even rendering due to the More-nav conditional. */}
        <button
          type="button"
          onClick={() => void handleNewConversation()}
          className="w-8 h-8 flex items-center justify-center rounded-lg text-muted-foreground/70 hover:text-foreground hover:bg-muted/60 transition-colors"
          title="New chat"
          aria-label="Start a new chat"
        >
          <SquarePen size={15} />
        </button>
        <button
          type="button"
          onClick={() => setDrawerOpen(true)}
          className="w-8 h-8 flex items-center justify-center rounded-lg text-muted-foreground/70 hover:text-foreground hover:bg-muted/60 transition-colors"
          title="Conversation history"
          aria-label="Open conversation history"
        >
          <History size={15} />
        </button>
        <button
          type="button"
          onClick={() => setVoiceOpen((v) => !v)}
          className={cn(
            'w-8 h-8 flex items-center justify-center rounded-lg transition-colors',
            voiceOpen
              ? 'bg-foreground text-background'
              : 'text-muted-foreground/70 hover:text-foreground hover:bg-muted/60',
          )}
          title="Voice mode"
          aria-label="Toggle voice mode"
        >
          <Mic size={15} />
        </button>
        {/* Secondary actions fold under a single overflow menu so the
            cluster stays a small row of primary affordances — approvals,
            run-now, history, voice — instead of seven competing icons. */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="w-8 h-8 flex items-center justify-center rounded-lg text-muted-foreground/70 hover:text-foreground hover:bg-muted/60 transition-colors"
              title="More"
              aria-label="More options"
            >
              <MoreHorizontal size={15} />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            <DropdownMenuItem onSelect={() => void handleNewConversation()} className="cursor-pointer">
              <SquarePen size={14} className="mr-2" />
              New chat
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link href={`/s/${slug}/settings?tab=memory`} className="cursor-pointer">
                <NotebookText size={14} className="mr-2" />
                What I remember
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link href={`/s/${slug}/chippi?tab=settings`} className="cursor-pointer">
                <Settings size={14} className="mr-2" />
                Chippi settings
              </Link>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <SplitPanelToggle isSplit={isSplit} onToggle={toggleSplit} />
      </div>

      {/* Conversation history drawer — softened overlay */}
      {drawerOpen && (
        <div className="fixed inset-0 z-50 flex">
          <div className="w-80 max-w-[85vw] bg-background border-r border-border flex flex-col">
            <div className="flex items-center justify-between px-4 py-3 border-b border-border/60">
              <span className="font-semibold text-sm">History</span>
              <button
                type="button"
                onClick={() => setDrawerOpen(false)}
                className="w-7 h-7 flex items-center justify-center rounded-md hover:bg-muted transition-colors"
                aria-label="Close history"
              >
                <X size={15} />
              </button>
            </div>
            <div className="flex-1 overflow-hidden">
              <ConversationSidebar
                slug={slug}
                conversations={conversations}
                activeId={activeConversationId}
                onSelect={handleSelectConversation}
                onNew={handleNewConversation}
                onDelete={handleDeleteConversation}
                onRename={handleRenameConversation}
              />
            </div>
          </div>
          <div className="flex-1 bg-foreground/10" onClick={() => setDrawerOpen(false)} />
        </div>
      )}

      {/* ── Main content area — supports split panel on desktop ──── */}
      <div className="flex flex-1 min-w-0 overflow-hidden" ref={containerRef}>
        {/* Left panel — all chat/workspace content */}
        <div
          className="flex flex-col h-full overflow-hidden min-w-0"
          style={{ width: isSplit ? `${leftWidthPercent}%` : '100%' }}
        >

      {/* ── Today view (no active conversation) ───────────────────── */}
      {isLoadingConversation ? (
        <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">
          One moment.
        </div>
      ) : (
        <>
          <AnimatePresence mode="popLayout">
            {isEmpty && (
              <motion.div
                key="chippi-hero"
                exit={{ opacity: 0, transition: { duration: 0.25, ease: [0.22, 1, 0.36, 1] } }}
                className="flex-1 flex flex-col items-center justify-center px-4 sm:px-6 pb-16 sm:pb-20"
              >
                <div className="w-full max-w-2xl">
                  <motion.h1
                    initial={{ opacity: 0, y: -4 }}
                    animate={{ opacity: greeting ? 1 : 0, y: 0 }}
                    transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1], delay: 0.05 }}
                    className="text-center text-[2.25rem] sm:text-[2.75rem] tracking-tight leading-tight text-foreground mb-6 sm:mb-8"
                    style={{ fontFamily: 'var(--font-title)' }}
                  >
                    {greeting || ' '}
                  </motion.h1>
                  {/* Day-one guidance — only for users with zero history.
                      Without this the empty hero is just a greeting + blank
                      composer, which is too sparse for first-run when the
                      realtor doesn't yet know what Chippi can do. */}
                  {isFresh && (
                    <motion.p
                      initial={{ opacity: 0, y: -2 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1], delay: 0.15 }}
                      className="text-center text-sm text-muted-foreground mb-6 sm:mb-8 max-w-md mx-auto"
                    >
                      Type below to get started — or browse{' '}
                      <span className="text-foreground/70">Full day</span>,{' '}
                      <span className="text-foreground/70">Drafts</span>, and{' '}
                      <span className="text-foreground/70">Activity</span> from the sidebar.
                    </motion.p>
                  )}
                  <motion.div
                    layoutId="chippi-composer"
                    layout
                    transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
                  >
                    {renderInput()}
                  </motion.div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {!isEmpty && (
            <>
              {/* Active thread */}
          <div className="flex-1 min-h-0 overflow-hidden">
            <ScrollArea className="h-full">
              <div className="w-full max-w-3xl mx-auto chat-content-wrap pt-12 sm:pt-14 pb-36">
                {/* Conversation title — quiet, only when we have one */}
                {activeConversationId && (
                  <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground mb-6 truncate">
                    {conversations.find((c) => c.id === activeConversationId)?.title ?? ''}
                  </p>
                )}

                <div className="space-y-7">
                  {messages.map((msg, i) => {
                    const isTail = i === messages.length - 1;
                    if (
                      isTail &&
                      msg.role === 'assistant' &&
                      msg.blocks.length === 0 &&
                      isStreaming
                    ) {
                      return null;
                    }
                    if (msg.role === 'assistant') {
                      // Find any create_plan tool call in this message and
                      // render a PlanCard inline below the transcript blocks.
                      const planBlocks = msg.blocks.filter(
                        (b): b is ToolCallBlock =>
                          b.type === 'tool_call' && b.name === 'create_plan',
                      );

                      return (
                        <div key={msg.id} className="flex gap-3">
                          <div className="w-7 h-7 rounded-full overflow-hidden flex-shrink-0 mt-0.5 ring-1 ring-border/60">
                            <img src="/chip-avatar.png" alt="" className="w-full h-full object-cover" />
                          </div>
                          <div className="flex-1 min-w-0 pt-0.5 space-y-3">
                            {/* PlanCard — rendered for each create_plan tool
                                call. Falls back to args so the card appears
                                immediately on tool_call_start (before result
                                comes in), which is the only data available in
                                the Modal runtime path. */}
                            {planBlocks.map((planBlock) => {
                              const plan = parsePlanResult(planBlock.result?.data ?? planBlock.args);
                              if (!plan) return null;
                              // Animate steps in while the message is still
                              // streaming; show settled state for history.
                              const isAnimating = !!(msg.streaming && isStreaming);
                              return (
                                <PlanCard
                                  key={planBlock.callId}
                                  task={plan.task}
                                  steps={plan.steps}
                                  isAnimating={isAnimating}
                                  activeStepIndex={isAnimating ? activePlanStepIndex : undefined}
                                />
                              );
                            })}
                            <Transcript
                              blocks={msg.blocks}
                              role={msg.role}
                              streaming={msg.streaming && isStreaming}
                              liveCallIds={liveCallIds}
                              onUserIntent={(text) => {
                                void handleSend(text, [], undefined);
                              }}
                              pendingApproval={
                                isTail && pendingApproval && !isStreaming
                                  ? {
                                      prompt: pendingApproval,
                                      onApprove: approveCelebrating,
                                      onDeny: deny,
                                      onAlwaysAllow: alwaysAllowCelebrating,
                                      busy: isStreaming,
                                    }
                                  : undefined
                              }
                              approvalCelebration={
                                chatCelebration && chatCelebration.messageId === msg.id
                                  ? {
                                      kind: chatCelebration.kind,
                                      subject: chatCelebration.subject,
                                      onDone: () => setChatCelebration(null),
                                    }
                                  : undefined
                              }
                            />
                            {/* Inline retry button — shown on the tail error
                                message so the realtor doesn't have to retype. */}
                            {isTail && agentError && !isStreaming && lastUserMsgRef.current && (
                              <button
                                type="button"
                                onClick={() => void retryLastMessage()}
                                className="mt-2 text-xs text-muted-foreground hover:text-foreground flex items-center gap-1.5 transition-colors"
                              >
                                <RotateCcw size={11} />
                                Try again
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    }
                    return (
                      <Transcript
                        key={msg.id}
                        blocks={msg.blocks}
                        role={msg.role}
                        streaming={msg.streaming && isStreaming}
                        liveCallIds={liveCallIds}
                        onUserIntent={(text) => {
                          void handleSend(text, [], undefined);
                        }}
                      />
                    );
                  })}

                  <AnimatePresence>
                    {showThinking && (
                      <motion.div
                        key="thinking-indicator"
                        initial={{ opacity: 0, y: 6 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -4 }}
                        transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
                        className="flex gap-3"
                      >
                        <div className="w-7 h-7 rounded-full overflow-hidden flex-shrink-0 mt-0.5 ring-1 ring-border/60">
                          <img src="/chip-avatar.png" alt="" className="w-full h-full object-cover" />
                        </div>
                        <div className="flex-1 min-w-0 pt-0.5 space-y-3">
                          {/* Preview PlanCard — appears immediately when the
                              plan_created event arrives, before the tool call
                              settles into a message block. */}
                          {activePlan && (
                            <PlanCard
                              task={activePlan.task}
                              steps={activePlan.steps}
                              isAnimating={true}
                              activeStepIndex={activePlanStepIndex}
                            />
                          )}
                          <ThinkingIndicator
                            currentAction={currentAction}
                            streamingReasoning={streamingReasoning}
                          />
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>

                  {/* Suggested follow-ups — visible only when the conversation
                      is idle (no thinking, no streaming, no error) and the
                      last turn was an assistant turn with completed tool
                      content. Click → fires the chip text as the next user
                      message. Removes the typing step for the obvious next
                      move (Claude / ChatGPT pattern). */}
                  {!showThinking && !isStreaming && !agentError && (() => {
                    const last = messages[messages.length - 1];
                    if (!last || last.role !== 'assistant' || !last.blocks) return null;
                    const suggestions = getSuggestionsForTurn(last.blocks);
                    if (suggestions.length === 0) return null;
                    return (
                      <SuggestedActions
                        suggestions={suggestions}
                        onSelect={(text) => {
                          void handleSend(text, [], undefined);
                        }}
                      />
                    );
                  })()}

                  {/* Errors land inline as Chippi assistant messages
                      (see useAgentTask.landChippiError) so the failure mode
                      reads like Chippi talking, not a red system banner. The
                      `error` state is still tracked for telemetry / a11y but
                      not rendered here. */}

                  <div ref={bottomRef} />
                </div>
              </div>
            </ScrollArea>
          </div>

          {/* The standalone Stop button used to live here — moved into the
              composer's right-slot (Send → Stop swap) so the abort affordance
              sits exactly where the user's eye is. ChatGPT / Claude pattern. */}

          {/* Docked input. Shares `layoutId="chippi-composer"` with the
              empty-state hero composer so framer-motion animates the
              transition from centered → docked when the first message ships. */}
          <motion.div
            layoutId="chippi-composer"
            layout
            transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
            className="sticky bottom-0 z-10 w-full max-w-3xl mx-auto chat-content-wrap pt-4 pb-[max(1rem,env(safe-area-inset-bottom))] bg-gradient-to-t from-background via-background to-background/0"
          >
            {atLimit ? (
              <div className="rounded-xl border border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-900/20 p-4 text-center">
                <div className="flex justify-center mb-2">
                  <AlertCircle size={20} className="text-amber-600 dark:text-amber-400" />
                </div>
                <p className="text-sm font-medium text-amber-800 dark:text-amber-200 mb-1">
                  You&apos;ve reached the 50-message limit for this conversation.
                </p>
                <p className="text-xs text-amber-700 dark:text-amber-300 mb-3">
                  Start a new conversation to continue chatting.
                </p>
                <Button
                  size="sm"
                  onClick={handleNewConversation}
                  variant="outline"
                  className="border-amber-400 text-amber-800 dark:text-amber-200 hover:bg-amber-100 dark:hover:bg-amber-800"
                >
                  Start new conversation
                </Button>
              </div>
            ) : (
              renderInput()
            )}
          </motion.div>
            </>
          )}
        </>
      )}

        </div>{/* end left panel */}

        {/* Right panel — visible only when split */}
        {isSplit && (
          <>
            <PanelResizeHandle
              onResize={setLeftWidthPercent}
              containerRef={containerRef}
              currentLeftWidth={leftWidthPercent}
            />
            <RightPanel
              slug={slug}
              activeTab={rightTab}
              onTabChange={setRightTab}
              className="flex-1 min-w-0"
            />
          </>
        )}
      </div>{/* end split panel container */}

      <VoiceMode
        open={voiceOpen}
        onClose={() => setVoiceOpen(false)}
        slug={slug}
        onTranscript={(role, text) => {
          setMessages((prev) => [
            ...prev,
            {
              id: `voice_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
              role,
              blocks: [{ type: 'text', content: text }],
            },
          ]);
        }}
      />
    </div>
  );
}
