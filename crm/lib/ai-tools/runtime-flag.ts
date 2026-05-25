/**
 * Runtime flag that selects which chat backend handles a request.
 *
 * `'modal'` — **default**. Proxies chat turns to the Modal Python sandbox
 * running Chippi via the OpenAI Agents SDK. Provides secure isolation,
 * autonomous long-running chains, background execution, and model fallback.
 * Requires MODAL_CHAT_URL in env. Deploy with `modal deploy agent/modal_app.py`.
 *
 * `'ts'` — in-process TypeScript fallback built on `@openai/agents`. Useful
 * for local dev when you don't have a Modal deployment running. Set
 * CHIPPI_CHAT_RUNTIME=ts to activate. Not recommended for production — lacks
 * sandbox isolation and background execution.
 *
 * Reads at call time so an env flip doesn't require a redeploy.
 */
export type ChatRuntime = 'modal' | 'ts';

export function chatRuntime(): ChatRuntime {
  const v = process.env.CHIPPI_CHAT_RUNTIME;
  return v === 'ts' ? 'ts' : 'modal';
}
