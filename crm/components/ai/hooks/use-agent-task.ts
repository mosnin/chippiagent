'use client';

/**
 * `useAgentTask` — the client-side driver for the on-demand agent.
 *
 * Owns the transcript state (a list of messages, each a block sequence),
 * streams events from /api/ai/task and /api/ai/task/approve, and exposes
 * send / approve / deny / abort as stable callbacks. Surrounding UI (the
 * conversation sidebar, @-mention search, voice mode, ...) stays in the
 * ChatInterface; this hook's only job is to run the loop.
 *
 * Stream → state mapping:
 *   - `text_delta`          → append to the trailing text block.
 *   - `tool_call_start`     → push a tool_call block with status=running.
 *   - `tool_call_result`    → update the matching block with result + status.
 *   - `permission_required` → surface the approval card via `pendingApproval`.
 *   - `permission_resolved` → clear `pendingApproval`.
 *   - `turn_complete`       → mark the trailing assistant message as saved.
 *   - `error`               → surface via `error`, end the stream.
 *
 * When the user approves or denies, a SEPARATE fetch hits the approve
 * endpoint; its events append to a fresh assistant message bubble (matching
 * the server, which persists the continuation as its own Message row).
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import type { AgentEvent } from '@/lib/ai-tools/events';
import type { MessageBlock, ToolCallBlock } from '@/lib/ai-tools/blocks';
import { SSEParser } from '@/lib/ai-tools/client/parse-sse';
import type { PermissionPromptData } from '@/components/ai/blocks/permission-prompt-view';
import { chippiErrorMessage, classifyError } from '@/lib/ai-tools/chippi-voice';

export interface UiMessage {
  id: string;
  role: 'user' | 'assistant';
  blocks: MessageBlock[];
  /** True while the assistant is actively streaming into this message. */
  streaming?: boolean;
}

export interface UseAgentTaskOptions {
  spaceSlug: string;
  /** Current conversation, or null to have the hook create one on first send. */
  conversationId: string | null;
  /**
   * Called when the hook creates a new conversation (first message of a
   * fresh chat). Parent uses this to update the sidebar + keep future
   * sends scoped to the same conversation.
   */
  onConversationCreated?: (conversationId: string) => void;
}

export interface UseAgentTaskResult {
  messages: UiMessage[];
  setMessages: React.Dispatch<React.SetStateAction<UiMessage[]>>;
  isStreaming: boolean;
  pendingApproval: PermissionPromptData | null;
  liveCallIds: Set<string>;
  error: string | null;
  /** Accumulated reasoning tokens for the current streaming turn. Empty string when not streaming. */
  streamingReasoning: string;
  /**
   * The plan emitted by the most recent `create_plan` tool call during the
   * current streaming turn. Null when not streaming or when no plan has been
   * created yet. Cleared automatically on `turn_complete`.
   */
  activePlan: { task: string; steps: Array<{ title: string; description: string }> } | null;
  send: (text: string, attachmentIds?: string[]) => Promise<void>;
  approve: (requestId: string, editedArgs?: Record<string, unknown>) => Promise<void>;
  deny: (requestId: string) => Promise<void>;
  /**
   * Phase 4c — approve this call AND auto-approve any future call to the
   * same tool in this conversation. Scoped to sessionStorage so a refresh
   * preserves the decision but a new browser session resets it.
   */
  alwaysAllow: (requestId: string, editedArgs?: Record<string, unknown>) => Promise<void>;
  /** Set of tool names currently auto-approved for this conversation. */
  allowedTools: Set<string>;
  /** Tear down an in-flight stream. Safe to call when nothing is running. */
  abort: () => void;
  clearError: () => void;
  /**
   * Re-sends the last user message. Safe to call after an error — the ref
   * is populated on every `send()` call so the composer doesn't need to
   * hold onto the text itself.
   */
  retryLastMessage: () => Promise<void>;
  /**
   * Seconds remaining on a rate-limit cool-down (429). Zero when no
   * rate-limit is active. The composer can show a countdown and re-enable
   * itself automatically when this reaches zero.
   */
  rateLimitSeconds: number;
}

/** Short random id for UI-local message keys. */
function newId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return Math.random().toString(36).slice(2);
}

export function useAgentTask(options: UseAgentTaskOptions): UseAgentTaskResult {
  const { spaceSlug, conversationId: initialConversationId, onConversationCreated } = options;

  const [messages, setMessages] = useState<UiMessage[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [pendingApproval, setPendingApproval] = useState<PermissionPromptData | null>(null);
  const [liveCallIds, setLiveCallIds] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [allowedTools, setAllowedTools] = useState<Set<string>>(new Set());
  const [rateLimitSeconds, setRateLimitSeconds] = useState(0);
  const [streamingReasoning, setStreamingReasoning] = useState('');
  const [activePlan, setActivePlan] = useState<{
    task: string;
    steps: Array<{ title: string; description: string }>;
  } | null>(null);

  // Refs shadow the reactive state for places where we need the latest value
  // synchronously without re-closing over it every render. We only sync
  // the ref from props when the prop actually changes — otherwise the
  // `ensureConversationId` path would see its own write overwritten on the
  // very next render while the parent is still holding the old value.
  const conversationIdRef = useRef(initialConversationId);
  useEffect(() => {
    conversationIdRef.current = initialConversationId;
  }, [initialConversationId]);

  // ── Phase 4c: always-allow for this chat ──────────────────────────────────
  // Auto-approvals are keyed by conversationId so switching chats resets the
  // list. sessionStorage (not localStorage) matches the "for this chat"
  // semantics: a fresh tab / new session forgets what you trusted before.
  const STORAGE_PREFIX = 'agent-allow:';
  const allowedToolsRef = useRef<Set<string>>(new Set());
  // Dedup guard for the auto-approve effect (declared up here so the
  // conversation-change effect below can reset it when switching chats).
  const autoApprovedRef = useRef<string | null>(null);
  useEffect(() => {
    allowedToolsRef.current = allowedTools;
  }, [allowedTools]);

  // Load the saved allow-list when the conversation changes. The dependency
  // is only the id — we deliberately don't rebind this effect when the
  // user adds a new tool (that's handled by `commitAllow` below writing
  // directly to storage).
  //
  // Also clears the transient approval + auto-approve tracking so
  // switching conversations mid-prompt doesn't bleed a prompt or an
  // already-fired requestId into the new chat.
  useEffect(() => {
    setPendingApproval(null);
    autoApprovedRef.current = null;
    if (typeof window === 'undefined') return;
    if (!initialConversationId) {
      setAllowedTools(new Set());
      return;
    }
    try {
      const raw = window.sessionStorage.getItem(STORAGE_PREFIX + initialConversationId);
      if (raw) {
        const parsed = JSON.parse(raw) as string[];
        if (Array.isArray(parsed)) {
          setAllowedTools(new Set(parsed.filter((x) => typeof x === 'string')));
          return;
        }
      }
    } catch {
      /* corrupt JSON / access denied — fall through to empty */
    }
    setAllowedTools(new Set());
  }, [initialConversationId]);

  function commitAllow(toolName: string) {
    const next = new Set(allowedToolsRef.current);
    next.add(toolName);
    allowedToolsRef.current = next;
    setAllowedTools(next);
    const cid = conversationIdRef.current;
    if (cid && typeof window !== 'undefined') {
      try {
        window.sessionStorage.setItem(STORAGE_PREFIX + cid, JSON.stringify(Array.from(next)));
      } catch {
        /* quota / private mode — in-memory allow-list still works */
      }
    }
  }

  const abortRef = useRef<AbortController | null>(null);
  const streamingMsgIdRef = useRef<string | null>(null);
  // Wall-clock when the assistant turn started. Set on the first event of
  // the turn; used to derive ReasoningBlock.durationMs at turn_complete.
  const turnStartedAtRef = useRef<number | null>(null);
  // Buffer for the current turn's reasoning. Mirrors `streamingReasoning`
  // state but read synchronously inside the turn_complete handler — the
  // setter is async and would lose data on the same tick.
  const reasoningBufferRef = useRef<string>('');
  // Fix 2: remember the last user input so the UI can offer a one-tap retry.
  const lastUserInputRef = useRef<{ text: string; attachmentIds?: string[] } | null>(null);
  // Fix 3: store the Retry-After value so the countdown effect can read it
  // without closing over stale state inside consumeStream.
  const rateLimitSecondsRef = useRef(0);

  const clearError = useCallback(() => setError(null), []);

  /**
   * Land a Chippi-voiced error line as an assistant message in the transcript.
   * If we already have an open assistant bubble (the streaming target), we
   * drop its empty content and replace it with the error text so the error
   * looks like Chippi talking, not like a system warning under a phantom
   * empty bubble.
   *
   * Also writes the same string into the `error` state so any banner-style
   * consumer still has something to render — but the visible affordance is
   * the inline assistant message.
   */
  const landChippiError = useCallback((message: string) => {
    setError(message);
    const targetId = streamingMsgIdRef.current;
    const errorBlock: MessageBlock = { type: 'text', content: message };
    setMessages((prev) => {
      if (targetId) {
        const idx = prev.findIndex((m) => m.id === targetId);
        if (idx !== -1) {
          const target = prev[idx];
          if (target.role === 'assistant') {
            const next = [...prev];
            // Fix 1: if the bubble already has partial content from the
            // stream, preserve it and append the error notice below it so
            // the user sees what arrived before the crash.  Only replace
            // when the bubble was still empty (no content streamed yet).
            const existingBlocks = target.blocks;
            next[idx] = {
              ...target,
              blocks:
                existingBlocks.length > 0
                  ? [...existingBlocks, errorBlock]
                  : [errorBlock],
              streaming: false,
            };
            return next;
          }
        }
      }
      // No live assistant bubble — append a fresh one.
      const id =
        typeof crypto !== 'undefined' && 'randomUUID' in crypto
          ? crypto.randomUUID()
          : Math.random().toString(36).slice(2);
      return [
        ...prev,
        {
          id,
          role: 'assistant',
          blocks: [errorBlock],
          streaming: false,
        },
      ];
    });
  }, []);

  const abort = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
  }, []);

  /**
   * Apply one AgentEvent to the transcript state. The targeted assistant
   * message is the one whose id matches `streamingMsgIdRef.current` — that
   * ref is set when we start a new assistant turn and cleared on close.
   */
  const applyEvent = useCallback((event: AgentEvent) => {
    switch (event.type) {
      case 'text_delta': {
        if (!event.delta) return;
        const targetId = streamingMsgIdRef.current;
        if (!targetId) return;
        setMessages((prev) => {
          // Defense-in-depth: if the target bubble is gone (some external
          // setter wiped messages while a stream was open), recreate a
          // tail assistant bubble at the new id instead of silently
          // no-op'ing every delta. The previous behavior turned every
          // mid-stream wipe into a totally invisible failure for the
          // realtor.
          if (!prev.some((m) => m.id === targetId)) {
            const recovered: UiMessage = {
              id: targetId,
              role: 'assistant',
              blocks: [{ type: 'text', content: event.delta }],
              streaming: true,
            };
            return [...prev, recovered];
          }
          return prev.map((m) => {
            if (m.id !== targetId) return m;
            const last = m.blocks[m.blocks.length - 1];
            if (last?.type === 'text') {
              const updated = [...m.blocks];
              updated[updated.length - 1] = { ...last, content: last.content + event.delta };
              return { ...m, blocks: updated };
            }
            return { ...m, blocks: [...m.blocks, { type: 'text', content: event.delta }] };
          });
        });
        return;
      }

      case 'tool_call_start': {
        const targetId = streamingMsgIdRef.current;
        if (!targetId) return;
        setLiveCallIds((s) => {
          const next = new Set(s);
          next.add(event.callId);
          return next;
        });
        setMessages((prev) =>
          prev.map((m) => {
            if (m.id !== targetId) return m;
            const block: ToolCallBlock = {
              type: 'tool_call',
              callId: event.callId,
              name: event.name,
              args: event.args,
              status: 'complete', // placeholder; overridden by `live` prop during streaming
              display: event.display,
            };
            return { ...m, blocks: [...m.blocks, block] };
          }),
        );
        return;
      }

      case 'tool_call_result': {
        setLiveCallIds((s) => {
          if (!s.has(event.callId)) return s;
          const next = new Set(s);
          next.delete(event.callId);
          return next;
        });
        setMessages((prev) =>
          prev.map((m) => ({
            ...m,
            blocks: m.blocks.map((b) => {
              if (b.type !== 'tool_call' || b.callId !== event.callId) return b;
              return {
                ...b,
                status: event.ok ? 'complete' : 'error',
                result: {
                  ok: event.ok,
                  summary: event.summary,
                  data: event.data,
                  error: event.error,
                },
              };
            }),
          })),
        );
        return;
      }

      case 'permission_required': {
        // Always surface the prompt. A hidden tab used to drop the event
        // entirely, which left the chat turn stuck mid-stream with no card
        // and no resolution when the realtor came back. pendingApproval is
        // just state — the inline card renders when the tab is next visible.
        setPendingApproval({
          requestId: event.requestId,
          callId: event.callId,
          name: event.name,
          args: event.args,
          summary: event.summary,
          otherPendingCalls: event.otherPendingCalls,
        });
        return;
      }

      case 'permission_resolved': {
        // Clear the prompt only if it still matches this requestId — a later
        // event for a different pending call shouldn't nuke a fresh prompt.
        setPendingApproval((prev) => (prev && prev.requestId === event.requestId ? null : prev));
        return;
      }

      case 'reasoning_delta': {
        if (!event.delta) return;
        if (turnStartedAtRef.current === null) turnStartedAtRef.current = Date.now();
        reasoningBufferRef.current += event.delta;
        setStreamingReasoning((prev) => prev + event.delta);
        return;
      }

      case 'plan_created': {
        setActivePlan({ task: event.task, steps: event.steps });
        return;
      }

      case 'turn_complete': {
        const targetId = streamingMsgIdRef.current;
        // Snapshot + reset the reasoning buffer + start time before any
        // async setState — we need both values inside the updater closure.
        const reasoning = reasoningBufferRef.current;
        const startedAt = turnStartedAtRef.current;
        reasoningBufferRef.current = '';
        turnStartedAtRef.current = null;
        if (targetId) {
          setMessages((prev) =>
            prev.map((m) => {
              if (m.id !== targetId) return m;
              // Persist the reasoning trace as the first block of the
              // assistant turn so reload reproduces the "Thought for Xs"
              // disclosure. Only if reasoning was actually produced.
              const trimmed = reasoning.trim();
              if (!trimmed) return { ...m, streaming: false };
              const durationMs = startedAt ? Date.now() - startedAt : undefined;
              const reasoningBlock: MessageBlock = {
                type: 'reasoning',
                content: trimmed,
                durationMs,
              };
              const existing = m.blocks ?? [];
              // Place the reasoning block first — Claude / o1 pattern.
              return {
                ...m,
                blocks: [reasoningBlock, ...existing],
                streaming: false,
              };
            }),
          );
        }
        setStreamingReasoning('');
        setActivePlan(null);
        return;
      }

      case 'error': {
        // Server hands us a Chippi-voiced line in `message`; if it didn't
        // (older server, raw fallback), pick one from the code.
        const text =
          event.message && event.message.length < 400
            ? event.message
            : chippiErrorMessage(event.code ?? 'internal');
        landChippiError(text);
        return;
      }
    }
  }, [landChippiError]);

  /**
   * Shared stream consumer. Opens a POST to `url` with `body`, applies every
   * event, and returns when the stream ends. The caller is responsible for
   * pushing the initial user message + starting the assistant turn.
   */
  const consumeStream = useCallback(
    async (url: string, body: unknown) => {
      abort();
      const controller = new AbortController();
      abortRef.current = controller;
      setIsStreaming(true);
      setError(null);

      try {
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
          signal: controller.signal,
        });

        if (!res.ok) {
          // Fix 3: on 429 read Retry-After so the composer can count down.
          if (res.status === 429) {
            const retryAfter = parseInt(res.headers.get('Retry-After') ?? '0', 10);
            if (retryAfter > 0) {
              rateLimitSecondsRef.current = retryAfter;
              setRateLimitSeconds(retryAfter);
            }
          }
          // Server already speaks Chippi for this route; if not, classify
          // by HTTP status as a fallback so the user never sees raw text.
          let message: string | undefined;
          try {
            const parsed = (await res.json()) as { error?: string };
            if (parsed?.error) message = parsed.error;
          } catch {
            /* non-JSON body */
          }
          if (!message || message.length > 400) {
            const code =
              res.status === 429
                ? 'rate_limited'
                : res.status === 401 || res.status === 403
                  ? 'auth'
                  : 'internal';
            message = chippiErrorMessage(code);
          }
          landChippiError(message);
          return;
        }

        if (!res.body) {
          landChippiError(chippiErrorMessage('network'));
          return;
        }

        const parser = new SSEParser();
        const reader = res.body.getReader();
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          for (const event of parser.feed(value)) applyEvent(event);
        }
        for (const event of parser.end()) applyEvent(event);
      } catch (err) {
        const aborted = (err as { name?: string }).name === 'AbortError';
        if (!aborted) {
          const raw = err instanceof Error ? err.message : 'Network error';
          landChippiError(chippiErrorMessage(classifyError(raw)));
        } else {
          // Aborted: just tidy the trailing empty assistant bubble.
          const targetId = streamingMsgIdRef.current;
          if (targetId) {
            setMessages((prev) =>
              prev
                .filter(
                  (m) => !(m.id === targetId && m.role === 'assistant' && m.blocks.length === 0),
                )
                .map((m) => (m.id === targetId ? { ...m, streaming: false } : m)),
            );
          }
        }
      } finally {
        abortRef.current = null;
        streamingMsgIdRef.current = null;
        setIsStreaming(false);
        setLiveCallIds(new Set());
        setStreamingReasoning('');
      }
    },
    [abort, applyEvent, landChippiError],
  );

  /**
   * Ensure we have a conversationId before opening a stream. The task route
   * will create one for us if we don't pass one, but we have no way to read
   * the new id back from the SSE stream — so we create it client-side first.
   */
  const ensureConversationId = useCallback(async (): Promise<string> => {
    if (conversationIdRef.current) return conversationIdRef.current;
    const res = await fetch('/api/ai/conversations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ slug: spaceSlug }),
    });
    if (!res.ok) throw new Error('Could not start conversation');
    const conv = (await res.json()) as { id: string };
    conversationIdRef.current = conv.id;
    onConversationCreated?.(conv.id);
    return conv.id;
  }, [spaceSlug, onConversationCreated]);

  const send = useCallback(
    async (text: string, attachmentIds?: string[]) => {
      const trimmed = text.trim();
      const hasAttachments = Array.isArray(attachmentIds) && attachmentIds.length > 0;
      // Allow attachment-only sends — the user might just want to drop in a
      // photo with no caption. Block when both text AND attachments are empty.
      if ((!trimmed && !hasAttachments) || isStreaming) return;

      // Fix 2: record immediately so retryLastMessage always has current data.
      lastUserInputRef.current = { text: trimmed, ...(hasAttachments ? { attachmentIds } : {}) };

      // Optimistic UI: push the user message + a streaming assistant
      // placeholder BEFORE we await conversation creation. This is what
      // flips the workspace from the empty / "Good evening" view into the
      // active thread; previously it waited on the POST /api/ai/conversations
      // round-trip (~200–500ms) and the user perceived a freeze. The thinking
      // indicator shows immediately because `messages` is non-empty.
      const userMsg: UiMessage = {
        id: newId(),
        role: 'user',
        blocks: [{ type: 'text', content: trimmed }],
      };
      const assistantMsgId = newId();
      const assistantMsg: UiMessage = {
        id: assistantMsgId,
        role: 'assistant',
        blocks: [],
        streaming: true,
      };
      streamingMsgIdRef.current = assistantMsgId;
      setMessages((prev) => [...prev, userMsg, assistantMsg]);
      setPendingApproval(null);

      let convId: string;
      try {
        convId = await ensureConversationId();
      } catch (err) {
        // Conversation creation failed — pull the optimistic placeholders
        // back so the realtor doesn't see a hung user message + empty
        // assistant bubble. landChippiError surfaces an error message in
        // its place via a fresh assistant entry.
        setMessages((prev) =>
          prev.filter((m) => m.id !== userMsg.id && m.id !== assistantMsgId),
        );
        streamingMsgIdRef.current = null;
        const raw = err instanceof Error ? err.message : '';
        landChippiError(chippiErrorMessage(classifyError(raw)));
        return;
      }

      await consumeStream('/api/ai/task', {
        spaceSlug,
        conversationId: convId,
        message: trimmed,
        ...(hasAttachments ? { attachmentIds } : {}),
      });
    },
    [isStreaming, spaceSlug, ensureConversationId, consumeStream, landChippiError],
  );

  const approve = useCallback(
    async (requestId: string, editedArgs?: Record<string, unknown>) => {
      if (isStreaming) return;
      // Start a new assistant bubble for the continuation. Matches the
      // server's persistence model (it saves a second Message row).
      const contId = newId();
      const contMsg: UiMessage = {
        id: contId,
        role: 'assistant',
        blocks: [],
        streaming: true,
      };
      streamingMsgIdRef.current = contId;
      setMessages((prev) => [...prev, contMsg]);

      await consumeStream(`/api/ai/task/resume/${encodeURIComponent(requestId)}`, {
        approved: true,
        ...(editedArgs ? { editedArgs } : {}),
      });
    },
    [isStreaming, consumeStream],
  );

  const deny = useCallback(
    async (requestId: string) => {
      if (isStreaming) return;
      // Snapshot the prompt before the stream's `permission_resolved` event
      // clears it — we use the snapshot to pre-populate PermissionBlocks
      // on the continuation bubble so the denial is visible immediately,
      // matching what the server persists for this turn.
      //
      // The snapshot includes otherPendingCalls (forwarded from the
      // server's permission_required event): a deny cascades to every
      // mutating call in the batch, so we show a block per cascaded call
      // too — not only the one the user clicked on.
      const snapshot = pendingApproval;
      const contId = newId();
      const initialBlocks: MessageBlock[] = [];
      if (snapshot) {
        initialBlocks.push({
          type: 'permission',
          callId: snapshot.callId,
          name: snapshot.name,
          args: snapshot.args,
          summary: snapshot.summary,
          decision: 'denied',
        });
        for (const other of snapshot.otherPendingCalls ?? []) {
          initialBlocks.push({
            type: 'permission',
            callId: other.callId,
            name: other.name,
            args: other.args,
            summary: other.summary,
            decision: 'denied',
          });
        }
      }
      const contMsg: UiMessage = {
        id: contId,
        role: 'assistant',
        blocks: initialBlocks,
        streaming: true,
      };
      streamingMsgIdRef.current = contId;
      setMessages((prev) => [...prev, contMsg]);

      await consumeStream(`/api/ai/task/resume/${encodeURIComponent(requestId)}`, {
        approved: false,
      });
    },
    [isStreaming, pendingApproval, consumeStream],
  );

  const alwaysAllow = useCallback(
    async (requestId: string, editedArgs?: Record<string, unknown>) => {
      // Capture the tool name from the CURRENT pending prompt at click time —
      // by the time approve() returns the prompt will have been cleared.
      const toolName = pendingApproval?.name;
      if (toolName) commitAllow(toolName);
      await approve(requestId, editedArgs);
    },
    [pendingApproval, approve],
  );

  // Fix 2: stable retry callback — calls send() with whatever was last sent.
  const retryLastMessage = useCallback(async () => {
    const last = lastUserInputRef.current;
    if (!last) return;
    await send(last.text, last.attachmentIds);
  }, [send]);

  // Fix 3: count down rateLimitSeconds to zero, then auto-unlock the composer.
  useEffect(() => {
    if (rateLimitSeconds <= 0) return;
    const id = setTimeout(() => {
      setRateLimitSeconds((s) => {
        const next = s - 1;
        rateLimitSecondsRef.current = next;
        return next;
      });
    }, 1000);
    return () => clearTimeout(id);
  }, [rateLimitSeconds]);

  // Auto-approve whenever we're paused on a tool the user has pre-trusted
  // for this chat. Runs after the initial turn's stream closes — that's the
  // moment `pendingApproval` flips to a value AND `isStreaming` goes false.
  // The autoApprovedRef guard (declared above) stops React 18's strict-mode
  // double-invocation from firing two approve requests for the same
  // requestId (setIsStreaming isn't visible yet on the synchronous second
  // pass) and also lets the conversation-change effect clear it.
  useEffect(() => {
    if (!pendingApproval) {
      autoApprovedRef.current = null;
      return;
    }
    if (isStreaming) return;
    if (!allowedTools.has(pendingApproval.name)) return;
    if (autoApprovedRef.current === pendingApproval.requestId) return;
    autoApprovedRef.current = pendingApproval.requestId;
    void approve(pendingApproval.requestId);
  }, [pendingApproval, isStreaming, allowedTools, approve]);

  return {
    messages,
    setMessages,
    isStreaming,
    pendingApproval,
    liveCallIds,
    error,
    streamingReasoning,
    activePlan,
    send,
    approve,
    deny,
    alwaysAllow,
    allowedTools,
    abort,
    clearError,
    retryLastMessage,
    rateLimitSeconds,
  };
}
