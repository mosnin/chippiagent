'use client';

/**
 * IntakeChat — the realtor's intake form rendered as a chat.
 *
 * The flow, the questions, the customization, the validation, and the
 * submission contract are exactly what the dynamic form did. Only the
 * presentation changed. Each question becomes a Chippi turn; the matching
 * input widget appears inline below it. Tap-to-submit on choice questions;
 * type + send on free-text. When the question list is exhausted (respecting
 * `visibleWhen`), we POST to /api/public/apply with the same payload shape
 * the dynamic form sent.
 *
 * What this is NOT:
 *   - It is NOT an LLM-driven interview. The form-config drives order.
 *     No streaming, no __FIELDS__ markers, no Modal. The "chat with an
 *     AI agent" feel is a presentational layer over a deterministic
 *     state machine.
 *   - It is NOT a redesign of the form-builder or the customization
 *     surface. Realtors edit their questions in the existing form
 *     builder; the chat presents them.
 *
 * Validation is sourced from `validateQuestion()` in the form-renderer
 * module so the chat enforces the same rules the form did.
 */

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useCallback,
  type KeyboardEvent as ReactKeyboardEvent,
} from 'react';
import { motion } from 'motion/react';
import { validateQuestion } from '@/components/form-renderer/question-renderer';
import { IntakeChatSuccess } from './intake-chat-success';
import { cn } from '@/lib/utils';
import {
  DURATION_BASE,
  EASE_OUT,
  STAGGER_CONTAINER,
  STAGGER_ITEM,
} from '@/lib/motion';
import {
  DEFAULT_RENTAL_FORM_CONFIG,
  DEFAULT_BUYER_FORM_CONFIG,
} from '@/lib/form-builder';
import {
  AlertCircle,
  ArrowUp,
  Check,
  Loader2,
  MessageCircle,
} from 'lucide-react';
import type { IntakeFormConfig, FormQuestion } from '@/lib/types';

// ── Types ────────────────────────────────────────────────────────────────────

type AnswerMap = Record<string, string | string[]>;
type LeadType = 'rental' | 'buyer';
type Phase = 'asking' | 'submitting' | 'done' | 'error';

interface ChatTurn {
  id: string;
  role: 'user' | 'assistant';
  text: string;
}

export interface IntakeChatCustomization {
  accentColor: string;
  thankYouTitle: string | null;
  thankYouMessage: string | null;
  privacyPolicyUrl?: string | null;
}

export interface IntakeChatProps {
  slug: string;
  spaceId: string;
  businessName: string;
  agentName: string;
  agentPhoto?: string | null;
  rentalFormConfig?: IntakeFormConfig | null;
  buyerFormConfig?: IntakeFormConfig | null;
  formConfig?: IntakeFormConfig | null;
  customization: IntakeChatCustomization;
  brokerageId?: string;
}

// ── Synthetic lead-type question (dual-config flows) ─────────────────────────

const LEAD_TYPE_QUESTION_ID = '__leadType__';

const LEAD_TYPE_QUESTION: FormQuestion = {
  id: LEAD_TYPE_QUESTION_ID,
  type: 'radio',
  label: 'Are you looking to rent or buy?',
  required: true,
  position: 0,
  options: [
    { value: 'rental', label: 'Renting' },
    { value: 'buyer', label: 'Buying' },
  ],
};

// ── Pure helpers ─────────────────────────────────────────────────────────────

function flattenQuestions(config: IntakeFormConfig | null | undefined): FormQuestion[] {
  if (!config) return [];
  const sections = [...config.sections].sort((a, b) => a.position - b.position);
  return sections.flatMap((s) =>
    [...s.questions].sort((a, b) => a.position - b.position),
  );
}

function evaluateVisibility(
  condition: FormQuestion['visibleWhen'],
  answers: AnswerMap,
): boolean {
  if (!condition) return true;
  const { questionId, operator, value: target } = condition;
  const raw = answers[questionId];
  const str = Array.isArray(raw) ? raw.join(',') : raw ?? '';
  switch (operator) {
    case 'equals':
      return str === target;
    case 'not_equals':
      return str !== target;
    case 'contains':
      return str.includes(target);
    default:
      return true;
  }
}

function formatAnswerText(question: FormQuestion, value: string | string[]): string {
  if (Array.isArray(value)) {
    return value
      .map((v) => question.options?.find((o) => o.value === v)?.label ?? v)
      .join(', ');
  }
  if (question.type === 'checkbox') {
    return value === 'true' ? 'Yes' : 'No';
  }
  return question.options?.find((o) => o.value === value)?.label ?? value;
}

function isTapToSubmit(type: FormQuestion['type']): boolean {
  return type === 'select' || type === 'radio';
}

/**
 * Build the /api/public/apply payload. Same shape the dynamic form sent.
 * Keeping the contract identical keeps server-side validation, scoring,
 * and downstream effects (vectorize, notify, trigger fire) behaving the
 * way they do today.
 */
function buildApplicationPayload(args: {
  slug: string;
  spaceId: string;
  brokerageId?: string;
  leadType: LeadType;
  answers: AnswerMap;
  formConfigVersion: number;
  privacyConsent?: boolean;
  visibleQuestionCount: number;
}): Record<string, unknown> {
  const {
    slug,
    spaceId,
    brokerageId,
    leadType,
    answers,
    formConfigVersion,
    privacyConsent,
    visibleQuestionCount,
  } = args;

  const at = (k: string): string | undefined => {
    const v = answers[k];
    return typeof v === 'string' && v.length > 0 ? v : undefined;
  };

  const systemName = at('name') ?? at('legalName') ?? '';
  const systemEmail = at('email') ?? '';
  const systemPhone = at('phone') ?? '';

  return {
    ...answers,
    slug,
    spaceId,
    ...(brokerageId ? { brokerageId } : {}),
    leadType,
    formLeadType: leadType,
    name: systemName,
    legalName: systemName,
    email: systemEmail,
    phone: systemPhone,
    additionalNotes: at('additionalNotes') ?? at('notes'),
    targetMoveInDate: at('targetMoveInDate') ?? at('moveTiming'),
    propertyAddress: at('propertyAddress') ?? at('location'),
    monthlyRent: at('monthlyRent') ?? at('budget'),
    monthlyGrossIncome: at('monthlyGrossIncome') ?? at('income'),
    employmentStatus: at('employmentStatus') ?? at('employment'),
    numberOfOccupants: at('numberOfOccupants') ?? at('occupants'),
    buyerBudget: at('buyerBudget'),
    preApprovalStatus: at('preApprovalStatus'),
    propertyType: at('propertyType'),
    buyerTimeline: at('buyerTimeline'),
    ...(privacyConsent !== undefined ? { privacyConsent } : {}),
    sourceLabel: 'intake-chat',
    formConfigVersion,
    answers,
    completedSteps: Array.from({ length: visibleQuestionCount }, (_, i) => i + 1),
  };
}

// ── Component ────────────────────────────────────────────────────────────────

export function IntakeChat({
  slug,
  spaceId,
  businessName,
  agentName,
  agentPhoto,
  rentalFormConfig,
  buyerFormConfig,
  formConfig: legacyFormConfig,
  customization,
  brokerageId,
}: IntakeChatProps) {
  // Flow resolution. When no realtor-customized config is supplied, fall
  // back to the library defaults so the chat always has questions to ask
  // (this is what makes the brokerage variant work without configuration).
  const hasAnyConfig =
    Boolean(rentalFormConfig) || Boolean(buyerFormConfig) || Boolean(legacyFormConfig);
  const effectiveRental: IntakeFormConfig | null = hasAnyConfig
    ? rentalFormConfig ?? null
    : DEFAULT_RENTAL_FORM_CONFIG;
  const effectiveBuyer: IntakeFormConfig | null = hasAnyConfig
    ? buyerFormConfig ?? null
    : DEFAULT_BUYER_FORM_CONFIG;

  const hasDual = Boolean(effectiveRental && effectiveBuyer);
  const onlyConfig: IntakeFormConfig | null =
    effectiveRental && !effectiveBuyer
      ? effectiveRental
      : effectiveBuyer && !effectiveRental
        ? effectiveBuyer
        : legacyFormConfig ?? null;

  const initialLeadType: LeadType | null = hasDual
    ? null
    : effectiveRental
      ? 'rental'
      : effectiveBuyer
        ? 'buyer'
        : legacyFormConfig?.leadType === 'buyer'
          ? 'buyer'
          : 'rental';

  // State
  const [leadType, setLeadType] = useState<LeadType | null>(initialLeadType);
  const [answers, setAnswers] = useState<AnswerMap>({});
  const [turns, setTurns] = useState<ChatTurn[]>([]);
  const [pendingValue, setPendingValue] = useState<string | string[]>('');
  const [pendingError, setPendingError] = useState<string | null>(null);
  const [phase, setPhase] = useState<Phase>('asking');
  const [applicationRef, setApplicationRef] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const activeConfig = useMemo<IntakeFormConfig | null>(() => {
    if (leadType === 'rental') return effectiveRental ?? onlyConfig;
    if (leadType === 'buyer') return effectiveBuyer ?? onlyConfig;
    return null;
  }, [leadType, effectiveRental, effectiveBuyer, onlyConfig]);

  const questionList = useMemo<FormQuestion[]>(() => {
    const base = flattenQuestions(activeConfig);
    return hasDual ? [LEAD_TYPE_QUESTION, ...base] : base;
  }, [activeConfig, hasDual]);

  const currentQuestion = useMemo<FormQuestion | null>(() => {
    for (const q of questionList) {
      if (answers[q.id] !== undefined) continue;
      if (!evaluateVisibility(q.visibleWhen, answers)) continue;
      return q;
    }
    return null;
  }, [questionList, answers]);

  // Refs
  const bottomRef = useRef<HTMLDivElement>(null);
  const askedRef = useRef<Set<string>>(new Set());
  const submitFiredRef = useRef(false);

  // Append an assistant turn for each new current question. No greeting
  // turn — the first question IS the opening. Filler greetings ("Hi, a
  // few quick questions") waste a turn and feel like a bot, not a person.
  useEffect(() => {
    if (!currentQuestion) return;
    if (askedRef.current.has(currentQuestion.id)) return;
    askedRef.current.add(currentQuestion.id);
    setTurns((prev) => [
      ...prev,
      { id: `ask:${currentQuestion.id}`, role: 'assistant', text: currentQuestion.label },
    ]);
    setPendingValue(currentQuestion.type === 'multi_select' ? [] : '');
    setPendingError(null);
  }, [currentQuestion]);

  // When the question queue empties, submit.
  useEffect(() => {
    if (currentQuestion !== null) return;
    if (phase !== 'asking') return;
    if (Object.keys(answers).length === 0) return;
    if (submitFiredRef.current) return;
    submitFiredRef.current = true;
    void submit();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentQuestion, phase, answers]);

  // Auto-scroll on every meaningful change. `block: 'nearest'` keeps the
  // scroll inside the chat's own scroll container (the shell's <main>) and
  // doesn't fight the page or pull the sticky header out of frame.
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [turns, currentQuestion, phase]);

  // Commit a single answer and advance.
  const commitAnswer = useCallback(
    (question: FormQuestion, value: string | string[]) => {
      const error = validateQuestion(question, value);
      if (error) {
        setPendingError(error);
        return;
      }
      if (question.id === LEAD_TYPE_QUESTION_ID) {
        setLeadType(value as LeadType);
      }
      setTurns((prev) => [
        ...prev,
        {
          id: `ans:${question.id}`,
          role: 'user',
          text: formatAnswerText(question, value),
        },
      ]);
      setAnswers((prev) => ({ ...prev, [question.id]: value }));
      setPendingValue('');
      setPendingError(null);
    },
    [],
  );

  // Skip an optional question with no user-visible bubble. Silently
  // advances — feels right for "rather not answer".
  const skipOptional = useCallback((question: FormQuestion) => {
    if (question.required) return;
    setAnswers((prev) => ({ ...prev, [question.id]: '' }));
    setPendingValue('');
    setPendingError(null);
  }, []);

  async function submit() {
    if (!activeConfig || !leadType) {
      setSubmitError('Form configuration is missing. Please refresh and try again.');
      setPhase('error');
      submitFiredRef.current = false;
      return;
    }
    setPhase('submitting');

    const consentRaw = answers['privacyConsent'];
    const privacyConsent =
      typeof consentRaw === 'string' ? consentRaw === 'true' : undefined;

    const visibleQuestionCount = questionList.filter((q) =>
      evaluateVisibility(q.visibleWhen, answers),
    ).length;

    const payload = buildApplicationPayload({
      slug,
      spaceId,
      brokerageId,
      leadType,
      answers,
      formConfigVersion: activeConfig.version,
      privacyConsent,
      visibleQuestionCount,
    });

    try {
      const res = await fetch('/api/public/apply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        setSubmitError(body.error || "We couldn't submit your application. Try again?");
        setPhase('error');
        submitFiredRef.current = false;
        return;
      }
      const data = (await res.json()) as { applicationRef?: string };
      setApplicationRef(data.applicationRef ?? null);
      setPhase('done');
    } catch {
      setSubmitError('Network error. Check your connection and try again.');
      setPhase('error');
      submitFiredRef.current = false;
    }
  }

  // Avatar repetition rule: show the realtor's avatar on the FIRST
  // assistant turn only. The shell header already establishes who's
  // speaking; repeating the same purple circle on every question reads
  // as decoration, not identity. Subsequent assistant turns keep the
  // indent so the conversational column stays aligned.
  let firstAssistantSeen = false;

  // Progress: count of visible questions vs how many the lead has
  // answered (or actively skipped). Stays at top-right so the lead
  // always has an answer to "how much longer is this?" without breaking
  // the chat rhythm.
  const totalQuestions = questionList.filter((q) =>
    evaluateVisibility(q.visibleWhen, answers),
  ).length;
  const answeredCount = Object.keys(answers).length;
  const showProgress =
    phase === 'asking' && totalQuestions > 0 && answeredCount < totalQuestions;

  return (
    <div className="space-y-8">
      {showProgress && (
        <div className="flex items-center justify-end -mb-4 pt-1">
          <p
            className="text-[11px] tabular-nums text-muted-foreground/70"
            aria-live="polite"
            aria-atomic="true"
          >
            Question {answeredCount + 1} of {totalQuestions}
          </p>
        </div>
      )}

      {turns.map((turn) => {
        if (turn.role === 'assistant') {
          const showAvatar = !firstAssistantSeen;
          firstAssistantSeen = true;
          return (
            <AssistantTurn
              key={turn.id}
              text={turn.text}
              agentPhoto={agentPhoto}
              agentName={agentName}
              accentColor={customization.accentColor}
              showAvatar={showAvatar}
            />
          );
        }
        return (
          <UserTurn
            key={turn.id}
            text={turn.text}
            accentColor={customization.accentColor}
          />
        );
      })}

      {phase === 'asking' && currentQuestion && (
        <CurrentQuestion
          key={currentQuestion.id}
          question={currentQuestion}
          value={pendingValue}
          onChange={(v) => {
            setPendingValue(v);
            if (pendingError) setPendingError(null);
          }}
          onCommit={(v) => commitAnswer(currentQuestion, v)}
          onSkip={() => skipOptional(currentQuestion)}
          error={pendingError}
          accentColor={customization.accentColor}
        />
      )}

      {phase === 'submitting' && (
        <SubmittingTurn accentColor={customization.accentColor} />
      )}

      {phase === 'error' && submitError && (
        <ErrorTurn
          message={submitError}
          accentColor={customization.accentColor}
          onRetry={() => {
            setSubmitError(null);
            void submit();
          }}
        />
      )}

      {phase === 'done' && (
        <IntakeChatSuccess
          businessName={businessName}
          agentPhoto={agentPhoto}
          applicationRef={applicationRef}
          thankYouTitle={customization.thankYouTitle}
          thankYouMessage={customization.thankYouMessage}
          accentColor={customization.accentColor}
        />
      )}

      <div ref={bottomRef} />
    </div>
  );
}

// Alias preserved so existing imports don't break.
export { IntakeChat as IntakeChatView };

// ─── Turn renderers ──────────────────────────────────────────────────────────

function AssistantAvatar({
  agentPhoto,
  agentName,
  accentColor,
}: {
  agentPhoto?: string | null;
  agentName?: string;
  accentColor: string;
}) {
  if (agentPhoto) {
    // eslint-disable-next-line @next/next/no-img-element
    return (
      <img
        src={agentPhoto}
        alt={agentName ?? 'Realtor'}
        className="w-7 h-7 rounded-full object-cover flex-shrink-0"
      />
    );
  }
  const initials =
    (agentName ?? '')
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((w) => w[0]?.toUpperCase() ?? '')
      .join('') || '';
  if (initials) {
    return (
      <span
        aria-hidden
        className="w-7 h-7 rounded-full flex-shrink-0 inline-flex items-center justify-center text-[10px] font-semibold text-white select-none"
        style={{ backgroundColor: accentColor }}
      >
        {initials}
      </span>
    );
  }
  return (
    <span
      aria-hidden
      className="w-7 h-7 rounded-full flex-shrink-0 inline-flex items-center justify-center bg-foreground/[0.06]"
    >
      <MessageCircle className="w-3 h-3 text-muted-foreground" />
    </span>
  );
}

function AssistantTurn({
  text,
  agentPhoto,
  agentName,
  accentColor,
  showAvatar,
}: {
  text: string;
  agentPhoto?: string | null;
  agentName?: string;
  accentColor: string;
  /** True on the first assistant turn only. Subsequent turns render an
   *  avatar-sized spacer so the column stays aligned without repeating
   *  the speaker's identity decor. */
  showAvatar: boolean;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: DURATION_BASE, ease: EASE_OUT }}
      className="flex items-start gap-3"
      aria-live="polite"
    >
      {showAvatar ? (
        <AssistantAvatar
          agentPhoto={agentPhoto}
          agentName={agentName}
          accentColor={accentColor}
        />
      ) : (
        <span aria-hidden className="w-7 h-7 flex-shrink-0" />
      )}
      <p className="text-[17px] sm:text-lg text-foreground leading-snug font-medium pt-0.5 whitespace-pre-wrap">
        {text}
      </p>
    </motion.div>
  );
}

function UserTurn({ text, accentColor }: { text: string; accentColor: string }) {
  // Accent-tinted bubble — the realtor's brand color at low opacity with
  // foreground text. Reads as "this is your voice" without the
  // confrontational pure-black slab the old `bg-foreground` produced. The
  // accent border at 30% gives the bubble a defined edge without becoming
  // a loud color block.
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: DURATION_BASE, ease: EASE_OUT }}
      className="flex justify-end"
    >
      <div
        className="max-w-[80%] ml-auto rounded-2xl rounded-br-md px-4 py-2.5 text-[15px] leading-relaxed whitespace-pre-wrap text-foreground border"
        style={{
          backgroundColor: withAlpha(accentColor, 0.12),
          borderColor: withAlpha(accentColor, 0.22),
        }}
      >
        {text}
      </div>
    </motion.div>
  );
}

// ─── Current-question renderer ───────────────────────────────────────────────

interface CurrentQuestionProps {
  question: FormQuestion;
  value: string | string[];
  onChange: (v: string | string[]) => void;
  onCommit: (v: string | string[]) => void;
  onSkip: () => void;
  error: string | null;
  accentColor: string;
}

function CurrentQuestion({
  question,
  value,
  onChange,
  onCommit,
  onSkip,
  error,
  accentColor,
}: CurrentQuestionProps) {
  // Description (if any) reads as a soft secondary line under the
  // assistant's question. Subtle — the realtor's voice carries the ask.
  const descriptionRow = question.description ? (
    <p className="pl-10 -mt-3 text-sm text-muted-foreground max-w-[36rem]">
      {question.description}
    </p>
  ) : null;

  // The input lives in its own row, indented to align with the assistant
  // message's content gutter (left of the avatar gutter so it reads as a
  // reply zone, not a nested form).
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: DURATION_BASE, ease: EASE_OUT }}
      className="space-y-3"
    >
      {descriptionRow}
      <div className="pl-10 pr-1">
        {renderInputForQuestion({
          question,
          value,
          onChange,
          onCommit,
          accentColor,
          error,
        })}
        {error && (
          <p className="mt-2 text-xs text-rose-600 dark:text-rose-400">{error}</p>
        )}
        {!question.required && question.type !== 'checkbox' && (
          <div className="mt-2 flex justify-end">
            <button
              type="button"
              onClick={onSkip}
              className="text-xs text-muted-foreground/70 hover:text-foreground transition-colors"
            >
              Skip
            </button>
          </div>
        )}
      </div>
    </motion.div>
  );
}

interface InputProps {
  question: FormQuestion;
  value: string | string[];
  onChange: (v: string | string[]) => void;
  onCommit: (v: string | string[]) => void;
  accentColor: string;
  error: string | null;
}

function renderInputForQuestion(props: InputProps) {
  const { question } = props;
  if (question.type === 'select' || question.type === 'radio') {
    return <ChoiceCards {...props} />;
  }
  if (question.type === 'multi_select') {
    return <ChoiceChips {...props} />;
  }
  if (question.type === 'checkbox') {
    return <YesNoChoice {...props} />;
  }
  if (question.type === 'date') {
    return <DateField {...props} />;
  }
  return <ChatComposer {...props} />;
}

// ─── Widgets — chat-native, content-fit, no form chrome ──────────────────────

function ChoiceCards({
  question,
  onCommit,
  accentColor,
}: InputProps) {
  const options = question.options ?? [];
  // Two options with short labels → horizontal pair.
  // 3-4 with short labels → flex-wrap.
  // 5+ or long labels → stack vertically.
  const longest = options.reduce((m, o) => Math.max(m, o.label.length), 0);
  const stack = options.length > 4 || longest > 28;

  // Selected-state flash on tap. Holds the chosen card in an accent-
  // filled state for 180ms before committing the answer — the visual
  // confirmation chat apps train leads to expect, and the difference
  // between "responsive" and "did my tap register?" on slow connections.
  const [pending, setPending] = useState<string | null>(null);

  const handleTap = (value: string) => {
    if (pending) return;
    setPending(value);
    setTimeout(() => onCommit(value), 180);
  };

  return (
    <motion.div
      variants={STAGGER_CONTAINER}
      initial="initial"
      animate="enter"
      className={cn(stack ? 'flex flex-col gap-2' : 'flex flex-wrap gap-2.5')}
    >
      {options.map((option) => {
        const isPending = pending === option.value;
        const otherPending = pending !== null && !isPending;
        return (
          <motion.button
            key={option.value}
            variants={STAGGER_ITEM}
            type="button"
            onClick={() => handleTap(option.value)}
            disabled={otherPending}
            className={cn(
              'group relative inline-flex items-center gap-2',
              'rounded-xl border bg-card',
              'px-5 py-3 text-[15px] font-medium text-foreground',
              'transition-all duration-150 active:scale-[0.98]',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background',
              isPending
                ? 'border-transparent text-white'
                : 'border-border/70 hover:bg-muted/40 hover:border-border',
              otherPending && 'opacity-50 cursor-not-allowed',
              stack ? 'w-full text-left justify-start' : 'min-w-[140px] justify-center text-center',
            )}
            style={
              isPending
                ? { backgroundColor: accentColor }
                : ({ ['--tw-ring-color' as never]: accentColor } as React.CSSProperties)
            }
            aria-pressed={isPending}
          >
            {isPending && <Check size={14} aria-hidden />}
            {option.label}
          </motion.button>
        );
      })}
    </motion.div>
  );
}

function ChoiceChips({ question, value, onChange, onCommit, accentColor }: InputProps) {
  const options = question.options ?? [];
  const selected = Array.isArray(value)
    ? value
    : typeof value === 'string' && value
      ? value.split(',').filter(Boolean)
      : [];

  const toggle = (v: string) => {
    const next = selected.includes(v)
      ? selected.filter((x) => x !== v)
      : [...selected, v];
    onChange(next);
  };

  const isEmpty = selected.length === 0;

  return (
    <div className="space-y-3">
      <motion.div
        variants={STAGGER_CONTAINER}
        initial="initial"
        animate="enter"
        className="flex flex-wrap gap-2"
      >
        {options.map((option) => {
          const isOn = selected.includes(option.value);
          return (
            <motion.button
              key={option.value}
              variants={STAGGER_ITEM}
              type="button"
              onClick={() => toggle(option.value)}
              className={cn(
                'inline-flex items-center gap-1.5 rounded-full border px-3.5 h-9 text-sm font-medium',
                'transition-all duration-150 active:scale-[0.97]',
                isOn ? 'text-white border-transparent' : 'text-foreground border-border/70 hover:bg-muted/40',
              )}
              style={
                isOn
                  ? { backgroundColor: accentColor, borderColor: accentColor }
                  : undefined
              }
            >
              {isOn && <Check size={13} aria-hidden />}
              {option.label}
            </motion.button>
          );
        })}
      </motion.div>
      <div className="flex justify-end">
        <PrimaryActionButton
          accentColor={accentColor}
          disabled={isEmpty && question.required}
          onClick={() => onCommit(selected)}
        >
          {isEmpty ? 'Skip' : 'Continue'}
        </PrimaryActionButton>
      </div>
    </div>
  );
}

function YesNoChoice({ onCommit, accentColor }: InputProps) {
  // Boolean checkbox → present as two tappable cards. The realtor's
  // original `question.label` (e.g. "I agree to the privacy policy.")
  // already lives in the assistant turn above; here we just need a clear
  // affirmative/negative choice.
  return (
    <div className="flex flex-wrap gap-2.5">
      {[
        { value: 'true', label: 'Yes' },
        { value: 'false', label: 'No' },
      ].map((option) => (
        <button
          key={option.value}
          type="button"
          onClick={() => onCommit(option.value)}
          className={cn(
            'rounded-xl border border-border/70 bg-card hover:bg-muted/40 hover:border-border',
            'px-6 py-3 text-[15px] font-medium text-foreground min-w-[120px]',
            'transition-all duration-150 active:scale-[0.98]',
            'focus-visible:outline-none focus-visible:ring-2',
          )}
          style={{ ['--tw-ring-color' as never]: accentColor } as React.CSSProperties}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

function DateField({ value, onChange, onCommit, accentColor, error }: InputProps) {
  const v = typeof value === 'string' ? value : '';
  return (
    <div className="flex items-stretch gap-2 max-w-md">
      <input
        type="date"
        value={v}
        onChange={(e) => onChange(e.target.value)}
        className={cn(
          'flex-1 h-11 rounded-xl border bg-background px-4 text-[15px]',
          'transition-colors duration-150',
          error
            ? 'border-rose-500/60'
            : 'border-border/70 focus:border-foreground/40 focus:outline-none',
        )}
      />
      <PrimaryActionButton
        accentColor={accentColor}
        disabled={!v}
        onClick={() => onCommit(v)}
      >
        Continue
      </PrimaryActionButton>
    </div>
  );
}

/**
 * Format a phone number as the user types. Strips non-digits and renders
 * the (XXX) XXX-XXXX shape progressively for US-style numbers. Pure
 * function so it's testable and predictable; not validation —
 * `validateQuestion` still gates submission.
 */
function formatPhoneAsTyped(raw: string): string {
  const digits = raw.replace(/\D/g, '').slice(0, 11);
  if (digits.length === 0) return '';
  if (digits.length <= 3) return `(${digits}`;
  if (digits.length <= 6) return `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
  if (digits.length <= 10) {
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  }
  return `+${digits.slice(0, 1)} (${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`;
}

const EMAIL_INLINE_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function ChatComposer({ question, value, onChange, onCommit, accentColor, error }: InputProps) {
  // Modern chat composer: rounded pill containing the input + a circular
  // send button. Mirrors the realtor-facing Chippi composer in shape.
  const v = typeof value === 'string' ? value : '';
  const isTextarea = question.type === 'textarea';
  const inputType =
    question.type === 'email'
      ? 'email'
      : question.type === 'phone'
        ? 'tel'
        : question.type === 'number'
          ? 'number'
          : 'text';
  const inputMode: React.HTMLAttributes<HTMLInputElement>['inputMode'] =
    question.type === 'email'
      ? 'email'
      : question.type === 'phone'
        ? 'tel'
        : question.type === 'number'
          ? 'numeric'
          : 'text';

  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement | null>(null);
  // Inline email validation — fires only after the lead has typed an `@`,
  // debounced 450ms. Silent while they're mid-address; gentle nudge when
  // the shape's wrong. Distinct from `error` (which is the Continue-time
  // gate from validateQuestion).
  const [inlineEmailError, setInlineEmailError] = useState<string | null>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, [question.id]);

  useEffect(() => {
    if (question.type !== 'email') {
      if (inlineEmailError) setInlineEmailError(null);
      return;
    }
    const trimmed = v.trim();
    if (trimmed.length === 0 || !trimmed.includes('@')) {
      if (inlineEmailError) setInlineEmailError(null);
      return;
    }
    const t = setTimeout(() => {
      setInlineEmailError(
        EMAIL_INLINE_RE.test(trimmed) ? null : "Doesn't look like a valid email yet.",
      );
    }, 450);
    return () => clearTimeout(t);
  }, [v, question.type, inlineEmailError]);

  // Phone format-as-you-type intercepts onChange so the displayed value
  // stays (XXX) XXX-XXXX-shaped regardless of how the lead types.
  const handleTextChange = (next: string) => {
    if (question.type === 'phone') {
      onChange(formatPhoneAsTyped(next));
      return;
    }
    onChange(next);
  };

  const onKeyDown = (
    e: ReactKeyboardEvent<HTMLInputElement | HTMLTextAreaElement>,
  ) => {
    if (isTextarea) {
      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        if (v.trim() || !question.required) onCommit(v);
      }
      return;
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      if (v.trim() || !question.required) onCommit(v);
    }
  };

  const empty = v.trim().length === 0;
  const sendDisabled = question.required ? empty : false;
  const showInlineError = !error && inlineEmailError !== null;

  return (
    <div className="space-y-1.5">
      <div
        className={cn(
          'flex items-end gap-2 rounded-3xl border bg-background pl-4 pr-2 py-1.5',
          'transition-colors duration-150',
          error || showInlineError
            ? 'border-rose-500/60'
            : 'border-border/70 focus-within:border-foreground/40',
        )}
      >
        {isTextarea ? (
          <textarea
            ref={inputRef as React.RefObject<HTMLTextAreaElement>}
            value={v}
            onChange={(e) => {
              handleTextChange(e.target.value);
              // Auto-grow.
              e.currentTarget.style.height = 'auto';
              e.currentTarget.style.height = `${Math.min(e.currentTarget.scrollHeight, 200)}px`;
            }}
            onKeyDown={onKeyDown}
            rows={1}
            placeholder={question.placeholder ?? 'Type your answer…'}
            className="flex-1 resize-none bg-transparent text-[15px] text-foreground placeholder:text-muted-foreground/50 outline-none leading-relaxed py-2 max-h-[200px]"
            aria-invalid={Boolean(error || showInlineError)}
          />
        ) : (
          <input
            ref={inputRef as React.RefObject<HTMLInputElement>}
            type={inputType}
            inputMode={inputMode}
            value={v}
            onChange={(e) => handleTextChange(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder={
              question.placeholder ?? defaultPlaceholderFor(question.type)
            }
            className="flex-1 bg-transparent text-[15px] text-foreground placeholder:text-muted-foreground/50 outline-none py-2"
            // autoComplete hints let iOS/Android suggest the right value
            // from the platform keychain — small but real completion lift.
            autoComplete={
              question.type === 'email'
                ? 'email'
                : question.type === 'phone'
                  ? 'tel-national'
                  : undefined
            }
            aria-invalid={Boolean(error || showInlineError)}
          />
        )}
        <button
          type="button"
          onClick={() => (sendDisabled ? undefined : onCommit(v))}
          disabled={sendDisabled}
          aria-label="Send answer"
          className={cn(
            'w-9 h-9 rounded-full flex-shrink-0 flex items-center justify-center self-end mb-0.5',
            'transition-all duration-150 active:scale-[0.94]',
            sendDisabled
              ? 'bg-foreground/15 text-foreground/40 cursor-not-allowed'
              : 'text-white',
          )}
          style={sendDisabled ? undefined : { backgroundColor: accentColor }}
        >
          <ArrowUp size={16} />
        </button>
      </div>
      {showInlineError && (
        <p
          className="px-2 text-xs text-rose-600 dark:text-rose-400"
          role="status"
        >
          {inlineEmailError}
        </p>
      )}
    </div>
  );
}

function defaultPlaceholderFor(type: FormQuestion['type']): string {
  switch (type) {
    case 'email':
      return 'you@example.com';
    case 'phone':
      return '(555) 123-4567';
    case 'number':
      return 'Enter a number';
    default:
      return 'Type your answer…';
  }
}

function PrimaryActionButton({
  accentColor,
  disabled,
  onClick,
  children,
}: {
  accentColor: string;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      className={cn(
        'rounded-full px-5 h-10 text-[14px] font-semibold inline-flex items-center justify-center gap-1.5',
        'transition-all duration-150 active:scale-[0.97]',
        disabled
          ? 'bg-foreground/15 text-foreground/40 cursor-not-allowed'
          : 'text-white shadow-sm',
      )}
      style={disabled ? undefined : { backgroundColor: accentColor }}
    >
      {children}
    </button>
  );
}

// ─── Color helper ────────────────────────────────────────────────────────────

/**
 * Add an alpha channel to a hex/rgb-style color string. Mirrors the
 * shell's helper — kept local so the chat doesn't need to import from a
 * sibling component file. Returns the input untouched on unknown formats
 * so a malformed realtor accent color never crashes the page.
 */
function withAlpha(color: string, alpha: number): string {
  const a = Math.max(0, Math.min(1, alpha));
  const hexMatch = color.match(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/);
  if (hexMatch) {
    let hex = hexMatch[1];
    if (hex.length === 3) {
      hex = hex
        .split('')
        .map((c) => c + c)
        .join('');
    }
    const r = parseInt(hex.slice(0, 2), 16);
    const g = parseInt(hex.slice(2, 4), 16);
    const b = parseInt(hex.slice(4, 6), 16);
    return `rgba(${r}, ${g}, ${b}, ${a})`;
  }
  if (color.startsWith('rgb')) {
    const nums = color.match(/[\d.]+/g);
    if (nums && nums.length >= 3) {
      return `rgba(${nums[0]}, ${nums[1]}, ${nums[2]}, ${a})`;
    }
  }
  return color;
}

// ─── Submitting / Error ──────────────────────────────────────────────────────

function SubmittingTurn({ accentColor }: { accentColor: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: DURATION_BASE, ease: EASE_OUT }}
      className="flex items-start gap-3"
    >
      <span
        aria-hidden
        className="w-7 h-7 rounded-full flex-shrink-0 inline-flex items-center justify-center"
        style={{ backgroundColor: accentColor }}
      >
        <Loader2 className="w-3.5 h-3.5 text-white animate-spin" />
      </span>
      <p className="text-[17px] sm:text-lg text-muted-foreground pt-0.5">
        Sending your answers…
      </p>
    </motion.div>
  );
}

function ErrorTurn({
  message,
  accentColor,
  onRetry,
}: {
  message: string;
  accentColor: string;
  onRetry: () => void;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: DURATION_BASE, ease: EASE_OUT }}
      className="flex items-start gap-3"
    >
      <span
        aria-hidden
        className="w-7 h-7 rounded-full flex-shrink-0 inline-flex items-center justify-center bg-rose-500/15"
      >
        <AlertCircle className="w-3.5 h-3.5 text-rose-600" />
      </span>
      <div className="space-y-2 pt-0.5">
        <p className="text-[15px] text-foreground">{message}</p>
        <button
          type="button"
          onClick={onRetry}
          className="rounded-full px-3.5 h-8 text-xs font-semibold border border-border/70 hover:bg-muted/40 transition-colors"
          style={{ borderColor: accentColor, color: accentColor }}
        >
          Try again
        </button>
      </div>
    </motion.div>
  );
}
