'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  Check,
  X,
  Pencil,
  ShieldCheck,
  Loader2,
  Infinity as InfinityIcon,
  Clock,
  Mail,
  MessageSquare,
  Send,
} from 'lucide-react';
import { cn } from '@/lib/utils';

/** SMS one-segment budget (GSM-7). Long-form is 153/segment after the first. */
const SMS_SOFT_LIMIT = 160;

export interface PermissionPromptData {
  requestId: string;
  callId: string;
  name: string;
  args: Record<string, unknown>;
  summary: string;
  /**
   * Other mutating calls the model queued in the same batch. The prompt
   * itself only shows the current call — but the hook keeps this list so
   * a deny can immediately render cascade blocks for every skipped call,
   * matching what the server persists.
   */
  otherPendingCalls?: Array<{
    callId: string;
    name: string;
    args: Record<string, unknown>;
    summary: string;
  }>;
}

/**
 * Human-readable args preview. The JSON dump works for tools where the
 * realtor truly needs to see the shape (update_contact, create_deal), but
 * for send_email / send_sms — the tools where the ACTUAL content matters
 * most — JSON is noisy and the body field escapes newlines. Switch on the
 * tool name and render labeled fields for those.
 *
 * Returns `null` when there's no tool-specific renderer, so the caller
 * falls back to the generic JSON pre.
 */
function PrettyArgs({ prompt }: { prompt: PermissionPromptData }): React.ReactElement | null {
  const a = prompt.args as Record<string, unknown>;
  if (prompt.name === 'send_email') {
    const to = typeof a.toEmail === 'string' ? a.toEmail : typeof a.contactId === 'string' ? `contact ${a.contactId}` : '—';
    const subject = typeof a.subject === 'string' ? a.subject : '—';
    const body = typeof a.body === 'string' ? a.body : '';
    return (
      <div className="mt-2.5 space-y-1.5 rounded-md border border-border bg-background/60 px-2.5 py-2 text-[12px]">
        <div><span className="text-muted-foreground font-medium">To:</span> {to}</div>
        <div><span className="text-muted-foreground font-medium">Subject:</span> {subject}</div>
        <div>
          <span className="text-muted-foreground font-medium">Body:</span>
          <p className="mt-0.5 whitespace-pre-wrap text-foreground/90 leading-relaxed">
            {body.length > 400 ? `${body.slice(0, 400)}…` : body}
          </p>
        </div>
        {typeof a.replyTo === 'string' && a.replyTo && (
          <div><span className="text-muted-foreground font-medium">Reply-To:</span> {a.replyTo}</div>
        )}
      </div>
    );
  }
  if (prompt.name === 'send_sms') {
    const to = typeof a.toPhone === 'string' ? a.toPhone : typeof a.contactId === 'string' ? `contact ${a.contactId}` : '—';
    const body = typeof a.body === 'string' ? a.body : '';
    return (
      <div className="mt-2.5 space-y-1.5 rounded-md border border-border bg-background/60 px-2.5 py-2 text-[12px]">
        <div><span className="text-muted-foreground font-medium">To:</span> {to}</div>
        <div>
          <span className="text-muted-foreground font-medium">Message:</span>
          <p className="mt-0.5 whitespace-pre-wrap text-foreground/90 leading-relaxed">
            {body.length > 320 ? `${body.slice(0, 320)}…` : body}
          </p>
        </div>
      </div>
    );
  }
  return null;
}

/**
 * Inline compose card for send_email / send_sms. The realtor edits in place
 * — no JSON, no pencil. Send fires the existing approval pipeline with the
 * edited subject/body, which routes to Resend (email) or Telnyx (SMS) on
 * the server side. Read-only recipient (To:) — recipient selection happens
 * upstream in the Chippi conversation, not in this card.
 */
function InlineComposeCard({
  kind,
  args,
  subject,
  body,
  onSubjectChange,
  onBodyChange,
  disabled,
}: {
  kind: 'email' | 'sms';
  args: Record<string, unknown>;
  subject: string;
  body: string;
  onSubjectChange: (v: string) => void;
  onBodyChange: (v: string) => void;
  disabled?: boolean;
}) {
  const to =
    kind === 'email'
      ? typeof args.toEmail === 'string'
        ? args.toEmail
        : typeof args.contactId === 'string'
          ? `Contact ${String(args.contactId).slice(0, 8)}`
          : '—'
      : typeof args.toPhone === 'string'
        ? args.toPhone
        : typeof args.contactId === 'string'
          ? `Contact ${String(args.contactId).slice(0, 8)}`
          : '—';

  const smsLen = body.length;
  const smsOver = smsLen > SMS_SOFT_LIMIT;
  const smsSegments = smsLen === 0 ? 0 : Math.ceil(Math.max(smsLen, 1) / SMS_SOFT_LIMIT);

  return (
    <div className="mt-2.5 rounded-md border border-border bg-background/80 overflow-hidden">
      {/* To row — read-only */}
      <div className="flex items-center gap-2 px-2.5 py-1.5 border-b border-border/60 text-[12px] text-muted-foreground">
        {kind === 'email' ? (
          <Mail size={11} className="flex-shrink-0 text-muted-foreground/70" aria-hidden />
        ) : (
          <MessageSquare size={11} className="flex-shrink-0 text-muted-foreground/70" aria-hidden />
        )}
        <span className="font-medium">To:</span>
        <span className="truncate text-foreground/80">{to}</span>
      </div>

      {/* Subject row (email only) — editable */}
      {kind === 'email' && (
        <input
          type="text"
          value={subject}
          onChange={(e) => onSubjectChange(e.target.value)}
          disabled={disabled}
          placeholder="Subject"
          className="w-full px-2.5 py-2 text-[13px] font-medium bg-transparent border-b border-border/60 text-foreground outline-none focus:border-foreground/40 transition-colors placeholder:text-muted-foreground/50 disabled:opacity-60"
        />
      )}

      {/* Body — editable, auto-grow with a max height to keep the prompt compact */}
      <textarea
        value={body}
        onChange={(e) => {
          onBodyChange(e.target.value);
          e.currentTarget.style.height = 'auto';
          e.currentTarget.style.height = `${Math.min(e.currentTarget.scrollHeight, 280)}px`;
        }}
        disabled={disabled}
        rows={kind === 'email' ? 6 : 3}
        placeholder={kind === 'email' ? 'Body…' : 'Message…'}
        className="w-full px-2.5 py-2 text-[13px] bg-transparent text-foreground outline-none resize-none leading-relaxed placeholder:text-muted-foreground/50 disabled:opacity-60 max-h-[280px]"
      />

      {/* Char counter for SMS */}
      {kind === 'sms' && (
        <div className="flex items-center justify-end gap-2 px-2.5 pb-1.5 text-[11px] tabular-nums text-muted-foreground/70">
          <span className={cn(smsOver && 'text-amber-600 dark:text-amber-400')}>
            {smsLen} / {SMS_SOFT_LIMIT}
            {smsSegments > 1 && (
              <>
                {' '}· {smsSegments} segments
              </>
            )}
          </span>
        </div>
      )}
    </div>
  );
}

interface PermissionPromptViewProps {
  prompt: PermissionPromptData;
  /** Async approve — may return/throw; component shows a spinner until it settles. */
  onApprove: (requestId: string, editedArgs?: Record<string, unknown>) => Promise<void>;
  onDeny: (requestId: string) => Promise<void>;
  /**
   * Phase 4c — "Always allow <tool> for this chat". When provided, we render
   * a third button that trusts the tool for the remainder of this conversation
   * and then fires approve for the current call. Omit if auto-approval isn't
   * supported in the host context (e.g. an external embed).
   */
  onAlwaysAllow?: (requestId: string, editedArgs?: Record<string, unknown>) => Promise<void>;
  /** Disable when another approval is already processing (single-active rule). */
  busy?: boolean;
}

/**
 * The "user confirms before mutation" card. Renders the summary + the args
 * preview, with Approve / Deny buttons inline. Clicking the pencil opens an
 * editor so the user can tweak the JSON args before approving — the Phase 3d
 * edit-args path is already supported server-side.
 */
export function PermissionPromptView({
  prompt,
  onApprove,
  onDeny,
  onAlwaysAllow,
  busy,
}: PermissionPromptViewProps) {
  const isSendEmail = prompt.name === 'send_email';
  const isSendSms = prompt.name === 'send_sms';
  const isSendTool = isSendEmail || isSendSms;

  const [editing, setEditing] = useState(false);
  const [argsText, setArgsText] = useState(() => {
    try { return JSON.stringify(prompt.args, null, 2); } catch { return '{}'; }
  });
  const [parseError, setParseError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState<null | 'approve' | 'deny' | 'always'>(null);

  // Inline compose state for send_email / send_sms. The draft fields are
  // editable in place — no JSON-pencil step — and ride through to the
  // server as `editedArgs` on Send. Initial values come from the prompt's
  // args (what Chippi composed). Reset when the prompt id changes so a
  // second queued send doesn't show the previous draft.
  const initialCompose = useMemo(() => {
    const a = prompt.args as Record<string, unknown>;
    return {
      subject: typeof a.subject === 'string' ? a.subject : '',
      body: typeof a.body === 'string' ? a.body : '',
    };
  }, [prompt.args]);
  const [compose, setCompose] = useState(initialCompose);
  useEffect(() => {
    setCompose(initialCompose);
  }, [prompt.requestId, initialCompose]);

  const composeDirty =
    compose.subject !== initialCompose.subject || compose.body !== initialCompose.body;
  const composeEmpty = compose.body.trim().length === 0;

  /** Shared pre-parse for the approve paths — keeps the JSON editor DRY. */
  function resolveEditedArgs(): { ok: true; edited?: Record<string, unknown> } | { ok: false } {
    // Send tools: merge the inline compose state into the original args.
    // Even when not dirty we send the explicit values so the server's
    // schema is satisfied regardless of editor history.
    if (isSendTool) {
      const merged: Record<string, unknown> = { ...prompt.args, body: compose.body };
      if (isSendEmail) merged.subject = compose.subject;
      return { ok: true, edited: composeDirty ? merged : undefined };
    }
    if (!editing) return { ok: true };
    try {
      return { ok: true, edited: JSON.parse(argsText) as Record<string, unknown> };
    } catch (err) {
      setParseError(err instanceof Error ? err.message : 'Invalid JSON. Fix before approving.');
      return { ok: false };
    }
  }

  async function doApprove() {
    setSubmitting('approve');
    try {
      const parsed = resolveEditedArgs();
      if (!parsed.ok) {
        setSubmitting(null);
        return;
      }
      await onApprove(prompt.requestId, parsed.edited);
    } finally {
      setSubmitting(null);
    }
  }

  async function doDeny() {
    setSubmitting('deny');
    try {
      await onDeny(prompt.requestId);
    } finally {
      setSubmitting(null);
    }
  }

  async function doAlwaysAllow() {
    if (!onAlwaysAllow) return;
    setSubmitting('always');
    try {
      const parsed = resolveEditedArgs();
      if (!parsed.ok) {
        setSubmitting(null);
        return;
      }
      await onAlwaysAllow(prompt.requestId, parsed.edited);
    } finally {
      setSubmitting(null);
    }
  }

  const disabled = busy || submitting !== null;

  return (
    <div className="rounded-xl border border-amber-500/30 bg-amber-50/70 dark:bg-amber-500/5 px-4 py-3">
      <div className="flex items-start gap-3">
        <div className="w-8 h-8 rounded-lg bg-amber-500/15 flex items-center justify-center flex-shrink-0 text-amber-700 dark:text-amber-400">
          <ShieldCheck size={15} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-amber-700 dark:text-amber-400 mb-0.5">
            {isSendEmail ? 'Email draft — review and send' : isSendSms ? 'SMS draft — review and send' : 'Approve before running'}
          </p>
          <p className="text-sm font-semibold text-foreground">{prompt.summary}</p>

          {/* Args preview / editor — three branches:
              1. Send tools (email / SMS): inline compose card with editable
                 subject/body fields. No pencil; the editor IS the surface.
              2. JSON editing toggled: textarea for power-user edits.
              3. Default: PrettyArgs (tool-specific renderer) or raw JSON. */}
          {isSendTool ? (
            <InlineComposeCard
              kind={isSendEmail ? 'email' : 'sms'}
              args={prompt.args as Record<string, unknown>}
              subject={compose.subject}
              body={compose.body}
              onSubjectChange={(v) => setCompose((p) => ({ ...p, subject: v }))}
              onBodyChange={(v) => setCompose((p) => ({ ...p, body: v }))}
              disabled={disabled}
            />
          ) : editing ? (
            <div className="mt-2.5">
              <textarea
                value={argsText}
                onChange={(e) => {
                  setArgsText(e.target.value);
                  setParseError(null);
                }}
                rows={Math.min(10, Math.max(4, argsText.split('\n').length + 1))}
                className="w-full text-[11px] font-mono bg-background/80 border border-border rounded-md px-2.5 py-1.5 text-foreground outline-none focus:border-foreground transition-colors"
                spellCheck={false}
                disabled={disabled}
              />
              {parseError && (
                <p className="mt-1 text-[11px] text-rose-600 dark:text-rose-400">{parseError}</p>
              )}
            </div>
          ) : (
            (() => {
              const pretty = PrettyArgs({ prompt });
              if (pretty) return pretty;
              return (
                <pre className="mt-2.5 text-[11px] bg-background/60 border border-border rounded-md px-2.5 py-1.5 font-mono text-foreground/80 overflow-x-auto">
                  {JSON.stringify(prompt.args, null, 2)}
                </pre>
              );
            })()
          )}

          {/* Also queued */}
          {(prompt.otherPendingCalls?.length ?? 0) > 0 && (
            <div className="mt-3 pt-3 border-t border-border">
              <p className="text-xs font-medium text-muted-foreground mb-1.5">
                Also queued in this run ({prompt.otherPendingCalls!.length}):
              </p>
              <div className="space-y-1">
                {prompt.otherPendingCalls!.map((call) => (
                  <div key={call.callId} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Clock size={10} className="flex-shrink-0" />
                    <span>{call.name}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={doApprove}
              disabled={disabled || (isSendTool && composeEmpty)}
              className={cn(
                'inline-flex items-center gap-1 rounded-md bg-foreground text-background px-3 py-2.5 min-h-[44px] text-xs font-semibold transition-all',
                'disabled:cursor-not-allowed disabled:opacity-50',
              )}
            >
              {submitting === 'approve' ? (
                <Loader2 size={12} className="animate-spin" />
              ) : isSendTool ? (
                <Send size={12} />
              ) : (
                <Check size={12} />
              )}
              {isSendTool ? 'Send' : editing ? 'Approve edited' : 'Approve'}
            </button>
            {onAlwaysAllow && (
              <button
                type="button"
                onClick={doAlwaysAllow}
                disabled={disabled}
                title={`Auto-approve ${prompt.name} for the rest of this chat`}
                className="inline-flex items-center gap-1 rounded-md border border-foreground/20 bg-background hover:bg-muted px-3 py-2.5 min-h-[44px] text-xs font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50"
              >
                {submitting === 'always' ? (
                  <Loader2 size={12} className="animate-spin" />
                ) : (
                  <InfinityIcon size={12} />
                )}
                Always allow
              </button>
            )}
            <button
              type="button"
              onClick={doDeny}
              disabled={disabled}
              className="inline-flex items-center gap-1 rounded-md border border-rose-400/50 bg-background text-rose-700 dark:text-rose-400 hover:bg-rose-500/10 px-3 py-2.5 min-h-[44px] text-xs font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50"
            >
              {submitting === 'deny' ? (
                <Loader2 size={12} className="animate-spin" />
              ) : (
                <X size={12} />
              )}
              {isSendTool ? 'Discard' : 'Deny'}
            </button>
            {!isSendTool && (
              <button
                type="button"
                onClick={() => setEditing((v) => !v)}
                disabled={disabled}
                className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Pencil size={11} />
                {editing ? 'Cancel edit' : 'Edit'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
