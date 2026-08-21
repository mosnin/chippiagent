/**
 * Structured logger.
 *
 * Emits JSON lines in production (so Vercel log drains can parse them) and
 * human-readable output in development. Automatically redacts common PII
 * fields (email, phone, name, to, from) and secret-bearing keys / values
 * before logging.
 *
 * Usage:
 *   import { logger } from '@/lib/logger';
 *   logger.info('[sms] sent', { messageId, to: phone });
 *   logger.error('[notify] email failed', { spaceId }, err);
 *
 * Migration note: replace console.log/info/warn/error calls in server code
 * with logger.info/warn/error. Do NOT log full request/response bodies,
 * phone numbers, or email addresses — use redacted context objects instead.
 */

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LEVEL_PRIORITY: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 };

const MIN_LEVEL: LogLevel = (process.env.LOG_LEVEL as LogLevel) ?? (process.env.NODE_ENV === 'production' ? 'info' : 'debug');

const PII_KEYS = new Set(['email', 'phone', 'to', 'from', 'phoneNumber', 'ownerPhone', 'ownerEmail', 'guestPhone', 'guestEmail', 'leadPhone', 'leadEmail', 'contactPhone', 'contactEmail']);

const SECRET_KEY_RE =
  /secret|password|authorization|api[_-]?key|private[_-]?key|client[_-]?secret|(?:access|refresh|id)?[_-]?token|service[_-]?role/i;

// Literal patterns only — no nested quantifiers. Applied to every string
// value and to serialized error messages so a provider "invalid key: sk-…"
// line cannot land in Vercel logs or get forwarded to a browser.
const SECRET_VALUE_PATTERNS: RegExp[] = [
  /sk-[A-Za-z0-9_-]{8,}/g,
  /sk_(?:live|test)_[A-Za-z0-9]+/g,
  /rk_(?:live|test)_[A-Za-z0-9]+/g,
  /\bre_[A-Za-z0-9]{8,}/g,
  /\bwhsec_[A-Za-z0-9]+/g,
  /Bearer\s+[A-Za-z0-9\-._~+/]+=*/gi,
  /eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g,
  /\bKEY[A-Z0-9]{16,}/g,
  /\bak_[A-Za-z0-9]{8,}/g,
  /\bxox[baprs]-[A-Za-z0-9-]+/g,
  /\bgh[ps]_[A-Za-z0-9]{20,}/g,
  /(?:API[_-]?KEY|SECRET|TOKEN|PASSWORD)\s*[:=]\s*\S+/gi,
];

function redactPiiValue(value: unknown): unknown {
  if (typeof value !== 'string' || value.length === 0) return value;
  if (value.length <= 4) return '***';
  // Preserve last 4 chars so phone/email tails are debuggable
  return `***${value.slice(-4)}`;
}

/** Strip secret-shaped substrings from a string. Safe to call on any text. */
export function redactSecretText(text: string): string {
  let out = text;
  for (const pattern of SECRET_VALUE_PATTERNS) {
    pattern.lastIndex = 0;
    out = out.replace(pattern, '[REDACTED]');
  }
  return out;
}

function redact(context: Record<string, unknown> | undefined): Record<string, unknown> | undefined {
  if (!context) return context;
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(context)) {
    if (PII_KEYS.has(key)) {
      out[key] = redactPiiValue(value);
    } else if (SECRET_KEY_RE.test(key) && typeof value === 'string') {
      out[key] = '[REDACTED]';
    } else if (value && typeof value === 'object' && !Array.isArray(value)) {
      out[key] = redact(value as Record<string, unknown>);
    } else if (typeof value === 'string') {
      out[key] = redactSecretText(value);
    } else {
      out[key] = value;
    }
  }
  return out;
}

function serializeError(err: unknown): Record<string, unknown> {
  if (!err) return {};
  if (err instanceof Error) {
    return {
      name: err.name,
      message: redactSecretText(err.message),
      ...(process.env.NODE_ENV !== 'production' && { stack: err.stack ? redactSecretText(err.stack) : err.stack }),
    };
  }
  if (typeof err === 'object') {
    const e = err as Record<string, unknown>;
    const message = typeof e.message === 'string' ? e.message : undefined;
    return {
      message: message !== undefined ? redactSecretText(message) : message,
      code: e.code,
      status: e.status ?? e.statusCode,
    };
  }
  return { message: redactSecretText(String(err)) };
}

function emit(level: LogLevel, message: string, context?: Record<string, unknown>, err?: unknown) {
  if (LEVEL_PRIORITY[level] < LEVEL_PRIORITY[MIN_LEVEL]) return;

  const ctx = redact(context);
  const errObj = err !== undefined ? serializeError(err) : undefined;

  if (process.env.NODE_ENV === 'production') {
    const payload = {
      level,
      ts: new Date().toISOString(),
      msg: redactSecretText(message),
      ...(ctx ?? {}),
      ...(errObj ? { err: errObj } : {}),
    };
    // Use stderr for warn/error, stdout for debug/info
    const stream = level === 'error' || level === 'warn' ? console.error : console.log;
    stream(JSON.stringify(payload));
  } else {
    const stream = level === 'error' ? console.error : level === 'warn' ? console.warn : console.log;
    if (ctx || errObj) {
      stream(`[${level}] ${redactSecretText(message)}`, { ...(ctx ?? {}), ...(errObj ? { err: errObj } : {}) });
    } else {
      stream(`[${level}] ${redactSecretText(message)}`);
    }
  }
}

export const logger = {
  debug: (message: string, context?: Record<string, unknown>) => emit('debug', message, context),
  info: (message: string, context?: Record<string, unknown>) => emit('info', message, context),
  warn: (message: string, context?: Record<string, unknown>, err?: unknown) => emit('warn', message, context, err),
  error: (message: string, context?: Record<string, unknown>, err?: unknown) => emit('error', message, context, err),
};

export type Logger = typeof logger;
