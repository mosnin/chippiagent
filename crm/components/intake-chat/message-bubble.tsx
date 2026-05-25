'use client';

import { motion } from 'motion/react';
import { MessageCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface MessageBubbleProps {
  role: 'user' | 'assistant';
  content: string;
  isStreaming?: boolean;
  agentPhoto?: string | null;
  agentName?: string;
  accentColor?: string; // hex like '#ff964f'
}

/** Derive up to two initials from an agent name. */
function initials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('');
}

function AgentAvatar({
  agentPhoto,
  agentName,
  accentColor,
}: {
  agentPhoto?: string | null;
  agentName?: string;
  accentColor?: string;
}) {
  const hasPhoto = Boolean(agentPhoto);
  const hasName = Boolean(agentName?.trim());

  if (hasPhoto) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={agentPhoto!}
        alt={agentName ?? 'Agent'}
        className="w-6 h-6 rounded-full object-cover flex-shrink-0"
      />
    );
  }

  if (hasName) {
    return (
      <span
        className="w-6 h-6 rounded-full flex-shrink-0 inline-flex items-center justify-center text-[9px] font-medium text-background leading-none select-none"
        style={{ backgroundColor: accentColor ?? 'var(--brand)' }}
        aria-hidden="true"
      >
        {initials(agentName!)}
      </span>
    );
  }

  // Fallback: MessageCircle icon in a neutral circle
  return (
    <span
      className="w-6 h-6 rounded-full flex-shrink-0 inline-flex items-center justify-center bg-foreground/[0.06]"
      aria-hidden="true"
    >
      <MessageCircle className="w-3 h-3 text-muted-foreground" />
    </span>
  );
}

export function MessageBubble({
  role,
  content,
  isStreaming = false,
  agentPhoto,
  agentName,
  accentColor,
}: MessageBubbleProps) {
  if (role === 'user') {
    return (
      <motion.div
        className="flex justify-end"
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.2 }}
      >
        <div
          className={cn(
            'max-w-[80%] ml-auto rounded-xl rounded-br-sm',
            'bg-foreground/[0.06] px-4 py-2.5',
            'text-sm text-foreground whitespace-pre-wrap leading-relaxed',
          )}
        >
          {content}
        </div>
      </motion.div>
    );
  }

  // assistant
  return (
    <motion.div
      className="flex items-start gap-2.5 max-w-[85%]"
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
    >
      <AgentAvatar
        agentPhoto={agentPhoto}
        agentName={agentName}
        accentColor={accentColor}
      />

      <p className="text-sm text-foreground whitespace-pre-wrap leading-relaxed pt-0.5">
        {content}
        {isStreaming && (
          <span
            className="inline-block w-[2px] h-[1em] bg-foreground/70 ml-0.5 animate-pulse"
            aria-hidden="true"
          />
        )}
      </p>
    </motion.div>
  );
}
