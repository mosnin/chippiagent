'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { DURATION_BASE, EASE_OUT } from '@/lib/motion';
import {
  composeBrokerMorningStory,
  type BrokerMorningSummary,
} from '@/lib/broker-morning-story';
import type { BrokerMorningResponse } from '@/app/api/broker/morning/route';

/**
 * The /broker home's one sentence — broker mirror of <MorningStory />. Same
 * Times-serif h1, same fetch-then-fade-in, same single-tap doorway. Different
 * destination: a 'realtor' doorway routes to /broker/realtors/{id}; a 'leads'
 * doorway routes to /broker/leads. Counts-only or all-clear sentences render
 * as a non-interactive heading.
 */
export function BrokerMorningStory() {
  const router = useRouter();
  const [summary, setSummary] = useState<BrokerMorningSummary | null>(null);
  const [agentSentence, setAgentSentence] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    void (async () => {
      try {
        const res = await fetch('/api/broker/morning', { signal: controller.signal });
        if (res.ok) {
          const data = (await res.json()) as BrokerMorningResponse;
          setSummary(data);
          setAgentSentence(data.composedSentence ?? null);
        }
      } catch {
        // non-critical — render nothing rather than a marketing line
      }
    })();
    return () => controller.abort();
  }, []);

  // While loading, render a non-breaking space so the layout doesn't jump.
  if (!summary) {
    return (
      <h1
        className="text-3xl tracking-tight text-foreground leading-tight"
        style={{ fontFamily: 'var(--font-title)' }}
      >
        &nbsp;
      </h1>
    );
  }

  const story = composeBrokerMorningStory(summary, agentSentence);
  const doorway = story.doorway;
  const isInteractive = doorway !== null;

  function handleTap() {
    if (!doorway) return;
    if (doorway.kind === 'realtor') {
      router.push(`/broker/realtors/${doorway.id}`);
    } else if (doorway.kind === 'leads') {
      router.push('/broker/leads');
    }
  }

  if (isInteractive) {
    return (
      <motion.button
        type="button"
        onClick={handleTap}
        key={story.text}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: DURATION_BASE, ease: EASE_OUT }}
        className={cn(
          'text-3xl tracking-tight leading-tight block text-left',
          'text-foreground hover:opacity-80 transition-opacity cursor-pointer',
        )}
        style={{ fontFamily: 'var(--font-title)' }}
      >
        {story.text}
      </motion.button>
    );
  }

  return (
    <motion.h1
      key={story.text}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: DURATION_BASE, ease: EASE_OUT }}
      className="text-3xl tracking-tight leading-tight text-foreground"
      style={{ fontFamily: 'var(--font-title)' }}
    >
      {story.text}
    </motion.h1>
  );
}
