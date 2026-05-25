'use client';

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import {
  Send,
  MessageCircle,
  Loader2,
  Users,
  PhoneIncoming,
  BarChart3,
  ArrowRight,
  CalendarDays,
  Clock,
  HelpCircle,
  Phone,
  User,
  Bot,
  ThumbsUp,
  Slash,
} from 'lucide-react';
import { createClient } from '@supabase/supabase-js';

// ── Types ─────────────────────────────────────────────────────────────────────

type ChatMessage = {
  id: string;
  content: string;
  senderName: string;
  senderId: string;
  createdAt: string;
  type?: 'user' | 'bot' | 'system';
  reactions?: Record<string, string[]>; // emoji -> array of user names
};

export type ChatContact = {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  scoreLabel: string | null;
};

export type TeamMember = {
  id: string;
  name: string;
  email: string | null;
  role: string;
};

type MentionItem = {
  id: string;
  name: string;
  type: 'lead' | 'member';
  detail: string | null;
  scoreLabel?: string | null;
};

interface TeamChatClientProps {
  contacts: ChatContact[];
  teamMembers: TeamMember[];
  brokerageId: string;
  currentUserId: string;
}

// ── Slash commands ───────────────────────────────────────────────────────────

const SLASH_COMMANDS = [
  { command: '/status', description: 'Show team member status', icon: Users },
  { command: '/leads', description: 'Count of unassigned brokerage leads', icon: PhoneIncoming },
  { command: '/pipeline', description: 'Pipeline summary across all agents', icon: BarChart3 },
  { command: '/assign', description: 'Assign a lead: /assign @lead @realtor', icon: ArrowRight },
  { command: '/tours-today', description: "Today's tours across the team", icon: CalendarDays },
  { command: '/followups', description: 'Overdue follow-ups across team', icon: Clock },
  { command: '/help', description: 'List all commands', icon: HelpCircle },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatTime(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  const isToday =
    d.getDate() === now.getDate() &&
    d.getMonth() === now.getMonth() &&
    d.getFullYear() === now.getFullYear();

  if (isToday) {
    return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  }

  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  const isYesterday =
    d.getDate() === yesterday.getDate() &&
    d.getMonth() === yesterday.getMonth() &&
    d.getFullYear() === yesterday.getFullYear();

  if (isYesterday) {
    return `Yesterday ${d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`;
  }

  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function initials(name: string) {
  return name
    .split(/[\s@]+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('');
}

function avatarColor(name: string) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  const colors = [
    'bg-blue-500/15 text-blue-700 dark:text-blue-400',
    'bg-green-500/15 text-green-700 dark:text-green-400',
    'bg-purple-500/15 text-purple-700 dark:text-purple-400',
    'bg-amber-500/15 text-amber-700 dark:text-amber-400',
    'bg-rose-500/15 text-rose-700 dark:text-rose-400',
    'bg-cyan-500/15 text-cyan-700 dark:text-cyan-400',
    'bg-indigo-500/15 text-indigo-700 dark:text-indigo-400',
  ];
  return colors[Math.abs(hash) % colors.length];
}

function scoreBadge(label: string | null) {
  if (!label) return null;
  const styles: Record<string, string> = {
    hot: 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300',
    warm: 'bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300',
    cold: 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300',
  };
  return (
    <span className={cn('inline-flex px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase', styles[label] ?? 'bg-muted text-muted-foreground')}>
      {label}
    </span>
  );
}

/** Render message content with @mentions highlighted in orange bold. */
function renderContent(content: string) {
  const parts = content.split(/(@[\w\s]+?)(?=\s@|\s*$|[.,!?])/g);
  // Use a simpler regex that catches @Name patterns
  const mentionRegex = /@([\w][\w\s]*\w)/g;
  const elements: React.ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = mentionRegex.exec(content)) !== null) {
    // Text before the mention
    if (match.index > lastIndex) {
      elements.push(content.slice(lastIndex, match.index));
    }
    elements.push(
      <span key={match.index} className="font-bold text-orange-600 dark:text-orange-400">
        {match[0]}
      </span>,
    );
    lastIndex = match.index + match[0].length;
  }

  // Remaining text
  if (lastIndex < content.length) {
    elements.push(content.slice(lastIndex));
  }

  return elements.length > 0 ? elements : content;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function TeamChatClient({
  contacts,
  teamMembers,
  brokerageId,
  currentUserId,
}: TeamChatClientProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [input, setInput] = useState('');
  const [hoveredMessageId, setHoveredMessageId] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const channelRef = useRef<ReturnType<ReturnType<typeof createClient>['channel']> | null>(null);
  const mentionListRef = useRef<HTMLDivElement>(null);
  const commandListRef = useRef<HTMLDivElement>(null);

  // Mention state
  const [mentionOpen, setMentionOpen] = useState(false);
  const [mentionQuery, setMentionQuery] = useState('');
  const [mentionIndex, setMentionIndex] = useState(0);
  const [mentionStart, setMentionStart] = useState<number | null>(null);

  // Slash command state
  const [commandOpen, setCommandOpen] = useState(false);
  const [commandQuery, setCommandQuery] = useState('');
  const [commandIndex, setCommandIndex] = useState(0);
  const [commandExecuting, setCommandExecuting] = useState(false);

  // Build unified mention list: team members + leads
  const mentionItems: MentionItem[] = useMemo(() => {
    const members: MentionItem[] = teamMembers.map((m) => ({
      id: m.id,
      name: m.name,
      type: 'member' as const,
      detail: m.role === 'broker_owner' ? 'Owner' : m.role === 'broker_admin' ? 'Admin' : 'Realtor',
    }));
    const leads: MentionItem[] = contacts.map((c) => ({
      id: c.id,
      name: c.name,
      type: 'lead' as const,
      detail: c.phone,
      scoreLabel: c.scoreLabel,
    }));
    return [...members, ...leads];
  }, [teamMembers, contacts]);

  const filteredMentions = useMemo(() => {
    if (!mentionQuery) return mentionItems.slice(0, 10);
    const q = mentionQuery.toLowerCase();
    return mentionItems.filter((item) => item.name.toLowerCase().includes(q)).slice(0, 10);
  }, [mentionItems, mentionQuery]);

  const filteredCommands = useMemo(() => {
    if (!commandQuery) return SLASH_COMMANDS;
    const q = commandQuery.toLowerCase();
    return SLASH_COMMANDS.filter(
      (c) =>
        c.command.toLowerCase().includes(q) ||
        c.description.toLowerCase().includes(q),
    );
  }, [commandQuery]);

  const closeMention = useCallback(() => {
    setMentionOpen(false);
    setMentionQuery('');
    setMentionIndex(0);
    setMentionStart(null);
  }, []);

  const closeCommand = useCallback(() => {
    setCommandOpen(false);
    setCommandQuery('');
    setCommandIndex(0);
  }, []);

  const insertMention = useCallback(
    (item: MentionItem) => {
      if (mentionStart === null) return;
      const textarea = inputRef.current;
      if (!textarea) return;

      const before = input.slice(0, mentionStart);
      const after = input.slice(textarea.selectionStart);
      const mentionText = `@${item.name}`;
      const newInput = before + mentionText + ' ' + after;

      setInput(newInput);
      closeMention();

      // If tagging a team member, fire off a notification (non-blocking)
      if (item.type === 'member' && item.id !== currentUserId) {
        const currentMember = teamMembers.find((m) => m.id === currentUserId);
        const senderName = currentMember?.name ?? 'Someone';
        fetch('/api/broker/chat-notify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            brokerageId,
            taggedUserId: item.id,
            message: newInput.trim(),
            senderName,
          }),
        }).catch(() => {
          // Notification is best-effort
        });
      }

      requestAnimationFrame(() => {
        if (inputRef.current) {
          const pos = before.length + mentionText.length + 1;
          inputRef.current.selectionStart = pos;
          inputRef.current.selectionEnd = pos;
          inputRef.current.focus();
        }
      });
    },
    [input, mentionStart, closeMention, currentUserId, teamMembers, brokerageId],
  );

  const insertCommand = useCallback(
    (cmd: (typeof SLASH_COMMANDS)[number]) => {
      setInput(cmd.command + ' ');
      closeCommand();
      requestAnimationFrame(() => {
        if (inputRef.current) {
          inputRef.current.focus();
          const pos = cmd.command.length + 1;
          inputRef.current.selectionStart = pos;
          inputRef.current.selectionEnd = pos;
        }
      });
    },
    [closeCommand],
  );

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  useEffect(() => {
    loadMessages();
    return () => {
      if (channelRef.current) {
        channelRef.current.unsubscribe();
      }
    };
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  // Subscribe to realtime messages once we have conversationId
  useEffect(() => {
    if (!conversationId) return;

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseAnonKey) return;

    const client = createClient(supabaseUrl, supabaseAnonKey);

    const channel = client
      .channel(`broker-chat-${conversationId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'Message',
          filter: `conversationId=eq.${conversationId}`,
        },
        (payload) => {
          const msg = payload.new as { id: string; role: string; content: string; createdAt: string };

          let senderName = 'Unknown';
          let senderId = '';
          if (msg.role.startsWith('user:')) {
            const parts = msg.role.split(':');
            senderId = parts[1] ?? '';
            senderName = parts.slice(2).join(':') || 'Unknown';
          }

          setMessages((prev) => {
            if (prev.some((m) => m.id === msg.id)) return prev;
            return [
              ...prev,
              {
                id: msg.id,
                content: msg.content,
                senderName,
                senderId,
                createdAt: msg.createdAt,
                type: 'user',
              },
            ];
          });
        },
      )
      .subscribe();

    channelRef.current = channel;

    return () => {
      channel.unsubscribe();
    };
  }, [conversationId]);

  async function loadMessages() {
    try {
      const res = await fetch('/api/broker/chat');
      if (res.ok) {
        const data = await res.json();
        setMessages(
          (data.messages ?? []).map((m: ChatMessage) => ({
            ...m,
            type: m.type ?? 'user',
            reactions: m.reactions ?? {},
          })),
        );
        setConversationId(data.conversationId ?? null);
      }
    } catch {
      toast.error('Failed to load chat');
    } finally {
      setLoading(false);
    }
  }

  async function executeSlashCommand(text: string) {
    const parts = text.trim().split(/\s+/);
    const command = parts[0].toLowerCase();
    const args = parts.slice(1).join(' ');

    // Insert a "system" message showing the command was run
    const cmdMsg: ChatMessage = {
      id: `cmd-${Date.now()}`,
      content: text.trim(),
      senderName: 'You',
      senderId: currentUserId,
      createdAt: new Date().toISOString(),
      type: 'system',
    };
    setMessages((prev) => [...prev, cmdMsg]);

    setCommandExecuting(true);

    try {
      const res = await fetch('/api/broker/chat-command', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ command, args, brokerageId }),
      });

      if (!res.ok) {
        throw new Error('Command failed');
      }

      const data = await res.json();

      // Insert the bot response
      const botMsg: ChatMessage = {
        id: `bot-${Date.now()}`,
        content: data.result,
        senderName: 'Chippi Bot',
        senderId: 'bot',
        createdAt: new Date().toISOString(),
        type: 'bot',
      };
      setMessages((prev) => [...prev, botMsg]);
    } catch {
      const errorMsg: ChatMessage = {
        id: `err-${Date.now()}`,
        content: 'Failed to execute command. Please try again.',
        senderName: 'Chippi Bot',
        senderId: 'bot',
        createdAt: new Date().toISOString(),
        type: 'bot',
      };
      setMessages((prev) => [...prev, errorMsg]);
    } finally {
      setCommandExecuting(false);
    }
  }

  async function handleSend() {
    const text = input.trim();
    if (!text) return;

    // Check if this is a slash command
    if (text.startsWith('/')) {
      setInput('');
      await executeSlashCommand(text);
      return;
    }

    setInput('');
    setSending(true);

    try {
      const res = await fetch('/api/broker/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: text }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to send message');
      }

      const newMsg = await res.json();

      setMessages((prev) => {
        if (prev.some((m) => m.id === newMsg.id)) return prev;
        return [...prev, { ...newMsg, type: 'user', reactions: {} }];
      });
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to send');
      setInput(text);
    } finally {
      setSending(false);
    }
  }

  function toggleReaction(messageId: string) {
    const emoji = '\u{1F44D}';
    const currentMember = teamMembers.find((m) => m.id === currentUserId);
    const myName = currentMember?.name ?? 'You';

    setMessages((prev) =>
      prev.map((msg) => {
        if (msg.id !== messageId) return msg;
        const reactions = { ...(msg.reactions ?? {}) };
        const names = reactions[emoji] ?? [];
        if (names.includes(myName)) {
          reactions[emoji] = names.filter((n) => n !== myName);
          if (reactions[emoji].length === 0) delete reactions[emoji];
        } else {
          reactions[emoji] = [...names, myName];
        }
        return { ...msg, reactions };
      }),
    );
  }

  // Group consecutive messages from the same sender
  function shouldShowAvatar(msg: ChatMessage, idx: number) {
    if (msg.type === 'bot' || msg.type === 'system') return true;
    if (idx === 0) return true;
    const prev = messages[idx - 1];
    if (prev.type === 'bot' || prev.type === 'system') return true;
    return (
      prev.senderId !== msg.senderId ||
      new Date(msg.createdAt).getTime() - new Date(prev.createdAt).getTime() > 5 * 60 * 1000
    );
  }

  // ── Mention handlers ──────────────────────────────────────────────────────

  function handleInputChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    const val = e.target.value;
    setInput(val);

    const textarea = inputRef.current;
    if (!textarea) return;
    const cursorPos = textarea.selectionStart;
    const textBefore = val.slice(0, cursorPos);

    // Check for slash command (/ at start of message)
    if (textBefore.startsWith('/')) {
      const query = textBefore.slice(1);
      if (!/\s/.test(query) || query === '') {
        setCommandOpen(true);
        setCommandQuery('/' + query);
        setCommandIndex(0);
        closeMention();
        return;
      }
    }
    closeCommand();

    // Check for @ mention
    const atIdx = textBefore.lastIndexOf('@');
    if (atIdx >= 0) {
      const charBeforeAt = atIdx > 0 ? textBefore[atIdx - 1] : ' ';
      const query = textBefore.slice(atIdx + 1);
      if ((charBeforeAt === ' ' || charBeforeAt === '\n' || atIdx === 0) && !/\s/.test(query)) {
        setMentionOpen(true);
        setMentionQuery(query);
        setMentionIndex(0);
        setMentionStart(atIdx);
        return;
      }
    }

    closeMention();
  }

  function handleInputKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    // Slash command navigation
    if (commandOpen && filteredCommands.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setCommandIndex((i) => Math.min(i + 1, filteredCommands.length - 1));
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setCommandIndex((i) => Math.max(i - 1, 0));
        return;
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        if (filteredCommands[commandIndex]) insertCommand(filteredCommands[commandIndex]);
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        closeCommand();
        return;
      }
    }

    // Mention navigation
    if (mentionOpen && filteredMentions.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setMentionIndex((i) => Math.min(i + 1, filteredMentions.length - 1));
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setMentionIndex((i) => Math.max(i - 1, 0));
        return;
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        if (filteredMentions[mentionIndex]) insertMention(filteredMentions[mentionIndex]);
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        closeMention();
        return;
      }
    }

    if (e.key === 'Enter' && !e.shiftKey && !mentionOpen && !commandOpen) {
      e.preventDefault();
      handleSend();
    }
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-[calc(100vh-10rem)]">
      <div className="mb-4">
        <h1 className="text-xl font-semibold tracking-tight">Team Chat</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Real-time team communication
        </p>
      </div>

      <Card className="flex-1 flex flex-col min-h-0">
        {/* Messages area */}
        <div
          ref={messagesContainerRef}
          className="flex-1 overflow-y-auto px-4 py-4 space-y-1"
        >
          {loading ? (
            <div className="flex items-center justify-center h-full">
              <Loader2 size={24} className="animate-spin text-muted-foreground" />
            </div>
          ) : messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center space-y-2">
              <MessageCircle size={32} className="text-muted-foreground/30" />
              <p className="text-sm text-muted-foreground">No messages yet.</p>
              <p className="text-xs text-muted-foreground/60">
                Start a conversation with your team! Type <kbd className="px-1 py-0.5 bg-muted rounded text-[10px]">/help</kbd> to see commands.
              </p>
            </div>
          ) : (
            <>
              {messages.map((msg, idx) => {
                const showAvatar = shouldShowAvatar(msg, idx);

                // ── System message (slash command echo) ──
                if (msg.type === 'system') {
                  return (
                    <div key={msg.id} className="flex justify-center my-2">
                      <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-muted/60 text-xs text-muted-foreground">
                        <Slash size={10} />
                        <span className="font-mono">{msg.content}</span>
                      </div>
                    </div>
                  );
                }

                // ── Bot message (command result) ──
                if (msg.type === 'bot') {
                  return (
                    <div key={msg.id} className="flex items-start gap-2.5 mt-3">
                      <div className="w-8 flex-shrink-0">
                        <div className="w-8 h-8 rounded-full flex items-center justify-center bg-orange-500/15 text-orange-600 dark:text-orange-400">
                          <Bot size={14} />
                        </div>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-baseline gap-2 mb-1">
                          <span className="text-xs font-semibold text-orange-600 dark:text-orange-400">
                            Chippi Bot
                          </span>
                          <span className="text-[10px] text-muted-foreground">
                            {formatTime(msg.createdAt)}
                          </span>
                        </div>
                        <div className="rounded-lg border border-border/60 bg-muted/30 px-3.5 py-2.5 text-sm">
                          <pre className="whitespace-pre-wrap break-words font-sans text-foreground/85 leading-relaxed">
                            {msg.content}
                          </pre>
                        </div>
                      </div>
                    </div>
                  );
                }

                // ── Regular user message ──
                return (
                  <div
                    key={msg.id}
                    className={cn(
                      'group flex items-start gap-2.5',
                      showAvatar ? 'mt-3' : 'mt-0.5',
                    )}
                    onMouseEnter={() => setHoveredMessageId(msg.id)}
                    onMouseLeave={() => setHoveredMessageId(null)}
                  >
                    {/* Avatar or spacer */}
                    <div className="w-8 flex-shrink-0">
                      {showAvatar && (
                        <div
                          className={`w-8 h-8 rounded-full flex items-center justify-center text-[10px] font-semibold ${avatarColor(
                            msg.senderName,
                          )}`}
                        >
                          {initials(msg.senderName)}
                        </div>
                      )}
                    </div>

                    <div className="flex-1 min-w-0">
                      {showAvatar && (
                        <div className="flex items-baseline gap-2 mb-0.5">
                          <span className="text-xs font-semibold">{msg.senderName}</span>
                          <span className="text-[10px] text-muted-foreground">
                            {formatTime(msg.createdAt)}
                          </span>
                        </div>
                      )}
                      <div className="relative">
                        <p className="text-sm text-foreground/90 whitespace-pre-wrap break-words leading-relaxed">
                          {renderContent(msg.content)}
                        </p>

                        {/* Reaction button on hover */}
                        {hoveredMessageId === msg.id && (
                          <button
                            onClick={() => toggleReaction(msg.id)}
                            className="absolute -top-2 -right-1 inline-flex items-center justify-center w-6 h-6 rounded border bg-background shadow-sm text-muted-foreground hover:text-foreground hover:bg-accent transition-colors text-xs"
                            title="React"
                          >
                            <ThumbsUp size={11} />
                          </button>
                        )}

                        {/* Reactions display */}
                        {msg.reactions &&
                          Object.keys(msg.reactions).length > 0 && (
                            <div className="flex gap-1 mt-1">
                              {Object.entries(msg.reactions).map(([emoji, names]) => (
                                <button
                                  key={emoji}
                                  onClick={() => toggleReaction(msg.id)}
                                  className={cn(
                                    'inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full border text-xs transition-colors',
                                    names.includes(
                                      teamMembers.find((m) => m.id === currentUserId)?.name ?? '',
                                    )
                                      ? 'border-orange-300 bg-orange-50 dark:border-orange-700 dark:bg-orange-900/30'
                                      : 'border-border bg-muted/40 hover:bg-muted',
                                  )}
                                >
                                  <span>{emoji}</span>
                                  <span className="text-[10px] font-medium text-muted-foreground">
                                    {names.length}
                                  </span>
                                </button>
                              ))}
                            </div>
                          )}
                      </div>
                    </div>
                  </div>
                );
              })}
              <div ref={messagesEndRef} />
            </>
          )}
        </div>

        {/* Input bar */}
        <div className="border-t border-border px-4 py-3">
          {/* Toolbar hint */}
          <div className="flex items-center gap-3 mb-2 text-[11px] text-muted-foreground/60">
            <span className="inline-flex items-center gap-1">
              <kbd className="px-1 py-0.5 bg-muted rounded text-[10px] font-mono">/</kbd>
              commands
            </span>
            <span className="inline-flex items-center gap-1">
              <kbd className="px-1 py-0.5 bg-muted rounded text-[10px] font-mono">@</kbd>
              mention
            </span>
            <span className="inline-flex items-center gap-1">
              <kbd className="px-1 py-0.5 bg-muted rounded text-[10px] font-mono">Shift+Enter</kbd>
              new line
            </span>
          </div>

          <div className="relative flex items-end gap-2">
            <div className="relative flex-1">
              <textarea
                ref={inputRef}
                value={input}
                onChange={handleInputChange}
                onKeyDown={handleInputKeyDown}
                onBlur={() =>
                  setTimeout(() => {
                    closeMention();
                    closeCommand();
                  }, 200)
                }
                placeholder="Type / for commands, @ to mention someone..."
                rows={1}
                className="w-full rounded-lg border border-border bg-background px-3.5 py-2.5 text-sm resize-none placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/50 max-h-32 transition-shadow"
                style={{ minHeight: '42px' }}
                onInput={(e) => {
                  const target = e.target as HTMLTextAreaElement;
                  target.style.height = 'auto';
                  target.style.height = Math.min(target.scrollHeight, 128) + 'px';
                }}
              />

              {/* Slash command palette */}
              {commandOpen && filteredCommands.length > 0 && (
                <div
                  ref={commandListRef}
                  className="absolute bottom-full mb-1 left-0 z-50 w-80 max-h-72 overflow-auto rounded-lg border bg-popover shadow-lg"
                >
                  <div className="px-3 py-2 border-b border-border/50">
                    <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                      Commands
                    </p>
                  </div>
                  {filteredCommands.map((cmd, i) => {
                    const Icon = cmd.icon;
                    return (
                      <button
                        key={cmd.command}
                        className={cn(
                          'w-full text-left px-3 py-2.5 text-sm flex items-center gap-3 transition-colors',
                          i === commandIndex
                            ? 'bg-accent text-accent-foreground'
                            : 'hover:bg-accent/50',
                        )}
                        onMouseDown={(e) => {
                          e.preventDefault();
                          insertCommand(cmd);
                        }}
                        onMouseEnter={() => setCommandIndex(i)}
                      >
                        <span className="inline-flex items-center justify-center h-7 w-7 rounded-md bg-primary/10 text-primary shrink-0">
                          <Icon size={14} />
                        </span>
                        <span className="flex flex-col min-w-0 flex-1">
                          <span className="font-mono font-medium text-xs">{cmd.command}</span>
                          <span className="text-xs text-muted-foreground truncate">
                            {cmd.description}
                          </span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}

              {/* @ mention dropdown */}
              {mentionOpen && filteredMentions.length > 0 && (
                <div
                  ref={mentionListRef}
                  className="absolute bottom-full mb-1 left-0 z-50 w-80 max-h-64 overflow-auto rounded-lg border bg-popover shadow-lg"
                >
                  {/* Section: Team Members */}
                  {filteredMentions.some((m) => m.type === 'member') && (
                    <>
                      <div className="px-3 py-1.5 border-b border-border/50">
                        <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                          Team Members
                        </p>
                      </div>
                      {filteredMentions
                        .map((item, idx) => ({ item, idx }))
                        .filter(({ item }) => item.type === 'member')
                        .map(({ item, idx }) => (
                          <button
                            key={item.id}
                            className={cn(
                              'w-full text-left px-3 py-2 text-sm flex items-center gap-2 transition-colors',
                              idx === mentionIndex
                                ? 'bg-accent text-accent-foreground'
                                : 'hover:bg-accent/50',
                            )}
                            onMouseDown={(e) => {
                              e.preventDefault();
                              insertMention(item);
                            }}
                            onMouseEnter={() => setMentionIndex(idx)}
                          >
                            <span className="inline-flex items-center justify-center h-6 w-6 rounded-full bg-blue-500/10 text-blue-600 dark:text-blue-400 shrink-0">
                              <User size={12} />
                            </span>
                            <span className="flex flex-col min-w-0 flex-1">
                              <span className="flex items-center gap-1.5">
                                <span className="truncate font-medium">{item.name}</span>
                                <span className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                                  {item.detail}
                                </span>
                              </span>
                            </span>
                          </button>
                        ))}
                    </>
                  )}
                  {/* Section: Leads */}
                  {filteredMentions.some((m) => m.type === 'lead') && (
                    <>
                      <div className="px-3 py-1.5 border-b border-border/50">
                        <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                          Leads
                        </p>
                      </div>
                      {filteredMentions
                        .map((item, idx) => ({ item, idx }))
                        .filter(({ item }) => item.type === 'lead')
                        .map(({ item, idx }) => (
                          <button
                            key={item.id}
                            className={cn(
                              'w-full text-left px-3 py-2 text-sm flex items-center gap-2 transition-colors',
                              idx === mentionIndex
                                ? 'bg-accent text-accent-foreground'
                                : 'hover:bg-accent/50',
                            )}
                            onMouseDown={(e) => {
                              e.preventDefault();
                              insertMention(item);
                            }}
                            onMouseEnter={() => setMentionIndex(idx)}
                          >
                            <span className="inline-flex items-center justify-center h-6 w-6 rounded-full bg-orange-500/10 text-orange-600 dark:text-orange-400 shrink-0">
                              <Phone size={12} />
                            </span>
                            <span className="flex flex-col min-w-0 flex-1">
                              <span className="flex items-center gap-1.5">
                                <span className="truncate font-medium">{item.name}</span>
                                {scoreBadge(item.scoreLabel ?? null)}
                              </span>
                              {item.detail && (
                                <span className="truncate text-xs text-muted-foreground">
                                  {item.detail}
                                </span>
                              )}
                            </span>
                          </button>
                        ))}
                    </>
                  )}
                </div>
              )}
            </div>

            <button
              onClick={handleSend}
              disabled={sending || commandExecuting || !input.trim()}
              className="inline-flex items-center justify-center w-10 h-10 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:pointer-events-none flex-shrink-0"
            >
              {sending || commandExecuting ? (
                <Loader2 size={16} className="animate-spin" />
              ) : (
                <Send size={16} />
              )}
            </button>
          </div>
        </div>
      </Card>
    </div>
  );
}
