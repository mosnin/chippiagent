import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

describe('logger', () => {
  let logSpy: ReturnType<typeof vi.spyOn>;
  let errorSpy: ReturnType<typeof vi.spyOn>;
  let warnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.resetModules();
  });

  afterEach(() => {
    logSpy.mockRestore();
    errorSpy.mockRestore();
    warnSpy.mockRestore();
    vi.unstubAllEnvs();
  });

  it('redacts email and phone fields in production', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('LOG_LEVEL', 'info');
    const { logger } = await import('@/lib/logger');

    logger.info('sent', { email: 'user@example.com', phone: '+15551234567' });

    expect(logSpy).toHaveBeenCalledTimes(1);
    const payload = JSON.parse(logSpy.mock.calls[0][0] as string);
    expect(payload.email).not.toContain('user@example.com');
    expect(payload.email).toBe('***.com');
    expect(payload.phone).not.toContain('+15551234567');
    expect(payload.phone).toBe('***4567');
  });

  it('preserves non-PII fields', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('LOG_LEVEL', 'info');
    const { logger } = await import('@/lib/logger');

    logger.info('sent', { spaceId: 'abc-123', count: 5 });

    const payload = JSON.parse(logSpy.mock.calls[0][0] as string);
    expect(payload.spaceId).toBe('abc-123');
    expect(payload.count).toBe(5);
  });

  it('serializes Error objects without leaking stack in production', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('LOG_LEVEL', 'info');
    const { logger } = await import('@/lib/logger');

    logger.error('boom', { spaceId: 'abc' }, new Error('kaboom'));

    const payload = JSON.parse(errorSpy.mock.calls[0][0] as string);
    expect(payload.err.message).toBe('kaboom');
    expect(payload.err.stack).toBeUndefined();
  });

  it('redacts nested PII fields', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('LOG_LEVEL', 'info');
    const { logger } = await import('@/lib/logger');

    logger.info('sent', { payload: { email: 'secret@example.com', safe: 'ok' } });

    const payload = JSON.parse(logSpy.mock.calls[0][0] as string);
    expect(payload.payload.email).toBe('***.com');
    expect(payload.payload.safe).toBe('ok');
  });

  it('respects LOG_LEVEL threshold', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('LOG_LEVEL', 'warn');
    const { logger } = await import('@/lib/logger');

    logger.debug('skipped');
    logger.info('skipped');
    logger.warn('kept');

    expect(logSpy).not.toHaveBeenCalled();
    expect(errorSpy).toHaveBeenCalledTimes(1); // warn routes to stderr in production
  });
});
