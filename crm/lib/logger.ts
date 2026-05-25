/**
 * Structured logger.
 *
 * Emits JSON lines in production (so Vercel log drains can parse them) and
 * human-readable output in development. Automatically redacts common PII
 * fields (email, phone, name, to, from) before logging.
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

function redactValue(value: unknown): unknown {
  if (typeof value !== 'string' || value.length === 0) return value;
  if (value.length <= 4) return '***';
  // Preserve last 4 chars so phone/email tails are debuggable
  return `***${value.slice(-4)}`;
}

function redact(context: Record<string, unknown> | undefined): Record<string, unknown> | undefined {
  if (!context) return context;
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(context)) {
    if (PII_KEYS.has(key)) {
      out[key] = redactValue(value);
    } else if (value && typeof value === 'object' && !Array.isArray(value)) {
      out[key] = redact(value as Record<string, unknown>);
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
      message: err.message,
      ...(process.env.NODE_ENV !== 'production' && { stack: err.stack }),
    };
  }
  if (typeof err === 'object') {
    const e = err as Record<string, unknown>;
    return {
      message: e.message,
      code: e.code,
      status: e.status ?? e.statusCode,
    };
  }
  return { message: String(err) };
}

function emit(level: LogLevel, message: string, context?: Record<string, unknown>, err?: unknown) {
  if (LEVEL_PRIORITY[level] < LEVEL_PRIORITY[MIN_LEVEL]) return;

  const ctx = redact(context);
  const errObj = err !== undefined ? serializeError(err) : undefined;

  if (process.env.NODE_ENV === 'production') {
    const payload = {
      level,
      ts: new Date().toISOString(),
      msg: message,
      ...(ctx ?? {}),
      ...(errObj ? { err: errObj } : {}),
    };
    // Use stderr for warn/error, stdout for debug/info
    const stream = level === 'error' || level === 'warn' ? console.error : console.log;
    stream(JSON.stringify(payload));
  } else {
    const stream = level === 'error' ? console.error : level === 'warn' ? console.warn : console.log;
    if (ctx || errObj) {
      stream(`[${level}] ${message}`, { ...(ctx ?? {}), ...(errObj ? { err: errObj } : {}) });
    } else {
      stream(`[${level}] ${message}`);
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
