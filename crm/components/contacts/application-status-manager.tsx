'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Loader2,
  CheckCircle2,
  Inbox,
  Search,
  AlertCircle,
  XCircle,
  Clock,
  CalendarCheck,
  Send,
  RefreshCw,
  MessageSquare,
  ChevronDown,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useRouter } from 'next/navigation';

interface ApplicationStatusManagerProps {
  contactId: string;
  currentStatus: string;
  statusNote: string | null;
}

interface PortalMessage {
  id: string;
  senderType: string;
  content: string;
  readAt: string | null;
  createdAt: string;
}

const STATUSES = [
  { key: 'received', label: 'Received', icon: Inbox, color: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300' },
  { key: 'under_review', label: 'Under Review', icon: Search, color: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300' },
  { key: 'tour_scheduled', label: 'Tour Scheduled', icon: CalendarCheck, color: 'bg-orange-50 text-orange-700 dark:bg-orange-500/10 dark:text-orange-400' },
  { key: 'approved', label: 'Approved', icon: CheckCircle2, color: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300' },
  { key: 'declined', label: 'Declined', icon: XCircle, color: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300' },
  { key: 'waitlisted', label: 'Waitlisted', icon: Clock, color: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300' },
  { key: 'needs_info', label: 'Needs Info', icon: AlertCircle, color: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300' },
];

export function ApplicationStatusManager({
  contactId,
  currentStatus,
  statusNote,
}: ApplicationStatusManagerProps) {
  const [status, setStatus] = useState(currentStatus);
  const [updating, setUpdating] = useState(false);
  const [note, setNote] = useState('');
  const [showNoteField, setShowNoteField] = useState(false);
  const [messages, setMessages] = useState<PortalMessage[]>([]);
  const [messageText, setMessageText] = useState('');
  const [sendingMessage, setSendingMessage] = useState(false);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [showMessages, setShowMessages] = useState(false);
  const [statusDropdownOpen, setStatusDropdownOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  // Fetch messages when expanded
  useEffect(() => {
    if (showMessages) {
      fetchMessages();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showMessages]);

  // Scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const fetchMessages = useCallback(async () => {
    setLoadingMessages(true);
    try {
      const res = await fetch(`/api/applications/${contactId}/message`);
      if (res.ok) {
        const data = await res.json();
        setMessages(data.messages ?? []);
      }
    } catch (err) {
      console.error('[status-manager] Failed to fetch messages:', err);
    } finally {
      setLoadingMessages(false);
    }
  }, [contactId]);

  async function updateStatus(newStatus: string) {
    if (newStatus === status || updating) return;
    setUpdating(true);
    setError(null);

    try {
      const res = await fetch(`/api/applications/${contactId}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: newStatus,
          note: note.trim() || undefined,
        }),
      });
      if (res.ok) {
        setStatus(newStatus);
        setNote('');
        setShowNoteField(false);
        setStatusDropdownOpen(false);
        router.refresh();
      } else {
        const data = await res.json().catch(() => null);
        setError(data?.error ?? "Couldn't update the status. Try again.");
      }
    } catch (err) {
      console.error('[status-manager] Update failed:', err);
      setError("Couldn't update the status. Try again.");
    } finally {
      setUpdating(false);
    }
  }

  async function sendMessage() {
    if (!messageText.trim() || sendingMessage) return;
    setSendingMessage(true);
    setError(null);

    try {
      const res = await fetch(`/api/applications/${contactId}/message`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: messageText.trim() }),
      });
      if (res.ok) {
        const data = await res.json();
        setMessages((prev: PortalMessage[]) => [...prev, data.message]);
        setMessageText('');
      } else {
        const data = await res.json().catch(() => null);
        setError(data?.error ?? "Couldn't send that message. Try again.");
      }
    } catch (err) {
      console.error('[status-manager] Send failed:', err);
      setError("Couldn't send that message. Try again.");
    } finally {
      setSendingMessage(false);
    }
  }

  const currentStatusConfig = STATUSES.find((s) => s.key === status) ?? STATUSES[0];
  const CurrentIcon = currentStatusConfig.icon;
  const unreadCount = messages.filter(
    (m: PortalMessage) => m.senderType === 'applicant' && !m.readAt,
  ).length;

  return (
    <div className="space-y-4">
      {/* Status Control */}
      <div className="space-y-2">
        <label id="status-label" className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block">
          Application Status
        </label>

        {/* Current status badge */}
        <div className="relative">
          <button
            onClick={() => setStatusDropdownOpen(!statusDropdownOpen)}
            onKeyDown={(e: React.KeyboardEvent) => {
              if (e.key === 'Escape' && statusDropdownOpen) {
                setStatusDropdownOpen(false);
              }
            }}
            aria-expanded={statusDropdownOpen}
            aria-haspopup="listbox"
            aria-labelledby="status-label"
            className={cn(
              'w-full flex items-center justify-between gap-2 px-3 min-h-[44px] rounded-lg text-sm font-medium border transition-colors',
              currentStatusConfig.color,
              'border-current/20',
            )}
          >
            <span className="flex items-center gap-2">
              <CurrentIcon size={14} aria-hidden="true" />
              {currentStatusConfig.label}
            </span>
            <ChevronDown size={14} className={cn('transition-transform', statusDropdownOpen && 'rotate-180')} aria-hidden="true" />
          </button>

          {/* Dropdown */}
          {statusDropdownOpen && (
            <div
              role="listbox"
              aria-labelledby="status-label"
              className="absolute z-10 mt-1 w-full rounded-lg border border-border bg-popover shadow-md overflow-hidden"
            >
              {STATUSES.map((s) => {
                const Icon = s.icon;
                const isActive = s.key === status;
                return (
                  <button
                    key={s.key}
                    role="option"
                    aria-selected={isActive}
                    onClick={() => {
                      if (!isActive) {
                        setStatusDropdownOpen(false);
                        updateStatus(s.key);
                      } else {
                        setStatusDropdownOpen(false);
                      }
                    }}
                    disabled={updating}
                    className={cn(
                      'w-full flex items-center gap-2 px-3 min-h-[44px] text-sm text-left hover:bg-muted transition-colors',
                      isActive && 'bg-muted font-medium',
                      updating && 'opacity-50',
                    )}
                  >
                    {updating && isActive ? (
                      <Loader2 size={12} className="animate-spin" aria-hidden="true" />
                    ) : (
                      <Icon size={12} aria-hidden="true" />
                    )}
                    {s.label}
                    {isActive && <span className="ml-auto text-xs text-muted-foreground">Current</span>}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Note toggle + field */}
        {!showNoteField ? (
          <button
            onClick={() => setShowNoteField(true)}
            className="text-xs text-muted-foreground hover:text-foreground transition-colors min-h-[44px] px-1"
          >
            + Add note with status update
          </button>
        ) : (
          <div className="space-y-2">
            <label htmlFor="status-note" className="sr-only">Status note</label>
            <textarea
              id="status-note"
              value={note}
              onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setNote(e.target.value)}
              placeholder="Add an optional note visible to the applicant..."
              className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring resize-none"
              rows={2}
              maxLength={500}
            />
            <div className="flex gap-2">
              <button
                onClick={() => {
                  setShowNoteField(false);
                  setNote('');
                }}
                className="text-xs text-muted-foreground hover:text-foreground transition-colors min-h-[44px] px-1"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Messages Section */}
      <div className="space-y-2">
        <button
          onClick={() => setShowMessages(!showMessages)}
          aria-expanded={showMessages}
          aria-controls="realtor-messages-panel"
          className="flex items-center gap-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider hover:text-foreground transition-colors min-h-[44px]"
        >
          <MessageSquare size={12} aria-hidden="true" />
          Applicant Messages
          {unreadCount > 0 && (
            <span
              className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-foreground text-background text-[10px] font-bold"
              aria-label={`${unreadCount} unread messages`}
            >
              {unreadCount}
            </span>
          )}
          <ChevronDown
            size={12}
            className={cn('transition-transform', showMessages && 'rotate-180')}
            aria-hidden="true"
          />
        </button>

        {showMessages && (
          <div id="realtor-messages-panel" className="rounded-lg border border-border overflow-hidden">
            {/* Message list */}
            <div
              role="log"
              aria-live="polite"
              aria-label="Applicant message history"
              className="max-h-60 overflow-y-auto p-3 space-y-2 bg-muted/20"
            >
              {loadingMessages ? (
                <div className="flex items-center justify-center py-4" role="status">
                  <Loader2 size={16} className="animate-spin text-muted-foreground" aria-hidden="true" />
                  <span className="sr-only">Loading messages</span>
                </div>
              ) : messages.length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-4">
                  No messages yet
                </p>
              ) : (
                messages.map((msg: PortalMessage) => {
                  const isRealtor = msg.senderType === 'realtor';
                  return (
                    <div
                      key={msg.id}
                      className={cn(
                        'flex',
                        isRealtor ? 'justify-end' : 'justify-start',
                      )}
                    >
                      <div
                        className={cn(
                          'max-w-[80%] rounded-lg px-3 py-2 text-xs',
                          isRealtor
                            ? 'bg-foreground text-background rounded-br-sm'
                            : 'bg-card border border-border rounded-bl-sm',
                        )}
                      >
                        <p className="font-medium mb-0.5 opacity-70">
                          {isRealtor ? 'You' : 'Applicant'}
                        </p>
                        <p className="whitespace-pre-wrap break-words">{msg.content}</p>
                        <time
                          dateTime={msg.createdAt}
                          className="opacity-50 mt-0.5 text-[10px] block"
                        >
                          {new Date(msg.createdAt).toLocaleString('en-US', {
                            month: 'short',
                            day: 'numeric',
                            hour: 'numeric',
                            minute: '2-digit',
                          })}
                        </time>
                      </div>
                    </div>
                  );
                })
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Compose */}
            <div className="border-t border-border p-2">
              <div className="flex gap-2">
                <input
                  type="text"
                  value={messageText}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setMessageText(e.target.value)}
                  onKeyDown={(e: React.KeyboardEvent<HTMLInputElement>) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      sendMessage();
                    }
                  }}
                  aria-label="Message to applicant"
                  placeholder="Send a message to applicant..."
                  maxLength={2000}
                  className="flex-1 rounded-md border border-border bg-background px-2.5 min-h-[44px] text-xs placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                  disabled={sendingMessage}
                />
                <button
                  onClick={sendMessage}
                  disabled={!messageText.trim() || sendingMessage}
                  aria-label={sendingMessage ? 'Sending message' : 'Send message'}
                  className={cn(
                    'rounded-md min-w-[44px] min-h-[44px] flex items-center justify-center text-xs font-medium transition-colors',
                    messageText.trim() && !sendingMessage
                      ? 'bg-foreground text-background hover:opacity-80'
                      : 'bg-muted text-muted-foreground cursor-not-allowed',
                  )}
                >
                  {sendingMessage ? (
                    <Loader2 size={12} className="animate-spin" aria-hidden="true" />
                  ) : (
                    <Send size={12} aria-hidden="true" />
                  )}
                </button>
              </div>
            </div>

            {/* Refresh button */}
            <div className="border-t border-border px-3 py-1.5 flex justify-end">
              <button
                onClick={fetchMessages}
                disabled={loadingMessages}
                aria-label="Refresh messages"
                className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors min-h-[44px] px-1"
              >
                <RefreshCw size={10} className={cn(loadingMessages && 'animate-spin')} aria-hidden="true" />
                Refresh
              </button>
            </div>
          </div>
        )}
      </div>

      {error && <p role="alert" className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
