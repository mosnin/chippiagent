'use client';

import { useEffect, useState } from 'react';
import { Send, CheckCircle2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { timeAgo } from '@/lib/formatting';

interface AgentQuestion {
  id: string;
  agentType: string;
  question: string;
  context: string | null;
  priority: number;
  contactId: string | null;
  Contact: { id: string; name: string } | null;
  createdAt: string;
  status: 'pending' | 'answered' | 'expired';
}

// ─── QuestionRow ─────────────────────────────────────────────────────────────

function QuestionRow({ question, onAnswered }: { question: AgentQuestion; onAnswered: (id: string) => void }) {
  const [answer, setAnswer] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [answeredOk, setAnsweredOk] = useState(false);
  const [fading, setFading] = useState(false);

  const isHighPriority = question.priority >= 50;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = answer.trim();
    if (!trimmed) {
      setError('Please write an answer');
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch(`/api/agent/questions/${question.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ answer: trimmed }),
      });
      if (!res.ok) throw new Error('Failed to submit');
      setAnsweredOk(true);
      setTimeout(() => {
        setFading(true);
        setTimeout(() => onAnswered(question.id), 300);
      }, 700);
    } catch {
      setError("Couldn't submit that. Try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <article
      className={cn(
        'py-5 first:pt-0 last:pb-0 transition-opacity duration-300',
        fading && 'opacity-0',
      )}
    >
      {/* Meta line */}
      <div className="flex items-center gap-3 text-xs text-muted-foreground">
        {isHighPriority && (
          <span className="inline-flex items-center gap-1 text-amber-600 dark:text-amber-400 font-medium">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
            High priority
          </span>
        )}
        {question.Contact && (
          <span className="truncate">{question.Contact.name}</span>
        )}
        <span className="ml-auto tabular-nums">{timeAgo(question.createdAt)}</span>
      </div>

      {/* Question */}
      <p className="mt-1.5 text-sm font-medium text-foreground leading-relaxed">
        {question.question}
      </p>

      {/* Context */}
      {question.context && (
        <p className="mt-1.5 text-[12px] text-muted-foreground italic leading-relaxed">
          {question.context}
        </p>
      )}

      {/* Answer form */}
      <form onSubmit={handleSubmit} className="mt-3">
        {answeredOk ? (
          <div className="flex items-center gap-1.5 text-sm text-emerald-600 dark:text-emerald-400">
            <CheckCircle2 size={14} />
            Answered, thanks
          </div>
        ) : (
          <div className="space-y-2">
            <textarea
              rows={2}
              value={answer}
              onChange={(e) => {
                setAnswer(e.target.value);
                if (error) setError(null);
              }}
              placeholder="Your answer…"
              disabled={submitting}
              className="text-sm w-full border border-border rounded-md p-2.5 resize-none bg-background focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-60 leading-relaxed"
              aria-label="Your answer"
            />
            <div className="flex items-center gap-2">
              {error && <p className="text-xs text-destructive">{error}</p>}
              <button
                type="submit"
                disabled={submitting || !answer.trim()}
                className="ml-auto inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-foreground text-background text-xs font-medium hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Send size={11} />
                {submitting ? 'Sending…' : 'Send'}
              </button>
            </div>
          </div>
        )}
      </form>
    </article>
  );
}

// ─── AgentQuestionsPanel ─────────────────────────────────────────────────────

const PAGE_SIZE = 10;

export function AgentQuestionsPanel() {
  const [questions, setQuestions] = useState<AgentQuestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch('/api/agent/questions');
        if (res.ok) setQuestions(await res.json());
      } catch {
        // non-critical
      } finally {
        setLoading(false);
      }
    }
    void load();
  }, []);

  function handleAnswered(id: string) {
    setQuestions((prev) => prev.filter((q) => q.id !== id));
  }

  // Hide the section entirely when there's nothing to weigh in on — keeps the
  // page calm. The chat surface still tells the user Chippi will check in
  // when stuck.
  if (!loading && questions.length === 0) return null;

  const visible = showAll ? questions : questions.slice(0, PAGE_SIZE);
  const hiddenCount = questions.length - PAGE_SIZE;

  return (
    <section>
      <div className="flex items-center gap-3 pb-3 border-b border-border/60">
        <h2 className="text-[11px] font-semibold tracking-[0.08em] uppercase text-muted-foreground">
          Questions I have
        </h2>
        {!loading && questions.length > 0 && (
          <span className="text-[11px] text-muted-foreground tabular-nums">
            {questions.length}
          </span>
        )}
      </div>

      {loading && (
        <div className="space-y-4 pt-5">
          {[1, 2].map((n) => (
            <div key={n} className="space-y-2">
              <div className="h-4 w-40 rounded bg-muted/50 animate-pulse" />
              <div className="h-10 w-full rounded bg-muted/30 animate-pulse" />
            </div>
          ))}
        </div>
      )}

      {!loading && visible.length > 0 && (
        <div className="divide-y divide-border/60">
          {visible.map((q) => (
            <QuestionRow key={q.id} question={q} onAnswered={handleAnswered} />
          ))}
        </div>
      )}

      {!loading && !showAll && hiddenCount > 0 && (
        <button
          type="button"
          onClick={() => setShowAll(true)}
          className="mt-4 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          Show {hiddenCount} more question{hiddenCount !== 1 ? 's' : ''}
        </button>
      )}
    </section>
  );
}
