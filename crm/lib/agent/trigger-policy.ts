const VALID_EVENTS = [
  'new_lead',
  'tour_completed',
  'deal_stage_changed',
  'application_submitted',
  'inbound_message',
  'goal_completed',
] as const;

export type TriggerEvent = typeof VALID_EVENTS[number];

/** Inbound lead / new-contact events that owe a first-touch SMS draft. */
export const INBOUND_LEAD_EVENTS = ['new_lead', 'application_submitted'] as const;
export type InboundLeadEvent = (typeof INBOUND_LEAD_EVENTS)[number];

/** A lead replied — if that reply is to first-touch, we owe a booking draft. */
export const INBOUND_MESSAGE_EVENT = 'inbound_message' as const;

export function isInboundLeadEvent(value: string): value is InboundLeadEvent {
  return (INBOUND_LEAD_EVENTS as readonly string[]).includes(value);
}

export function isInboundMessageEvent(value: string): value is typeof INBOUND_MESSAGE_EVENT {
  return value === INBOUND_MESSAGE_EVENT;
}


const parsedCache = new Map<string, Set<TriggerEvent>>();
const warnedInvalidValues = new Set<string>();
const warnedEmptyValues = new Set<string>();

export function isTriggerEvent(value: string): value is TriggerEvent {
  return VALID_EVENTS.includes(value as TriggerEvent);
}

export function parseImmediateEvents(rawValue: string | undefined): Set<TriggerEvent> {
  const raw = rawValue?.trim() ?? '';
  if (!raw || raw.toLowerCase() === 'all') return new Set<TriggerEvent>(VALID_EVENTS);
  const cached = parsedCache.get(raw);
  if (cached) return new Set<TriggerEvent>(cached);

  const tokens = raw.split(',').map((v) => v.trim()).filter(Boolean);
  const parsed = tokens.filter((v): v is TriggerEvent => isTriggerEvent(v));

  const invalid = tokens.filter((v) => !isTriggerEvent(v));
  if (invalid.length > 0) {
    if (!warnedInvalidValues.has(raw)) {
      console.warn('[agent/trigger] Invalid AGENT_IMMEDIATE_EVENTS tokens; defaulting to all', {
        invalid,
        allowed: VALID_EVENTS,
      });
      warnedInvalidValues.add(raw);
    }
    return new Set<TriggerEvent>(VALID_EVENTS);
  }

  if (parsed.length === 0) {
    if (!warnedEmptyValues.has(raw)) {
      console.warn('[agent/trigger] Empty AGENT_IMMEDIATE_EVENTS after parsing; defaulting to all');
      warnedEmptyValues.add(raw);
    }
    return new Set<TriggerEvent>(VALID_EVENTS);
  }

  const result = new Set<TriggerEvent>(parsed);
  parsedCache.set(raw, result);
  return new Set<TriggerEvent>(result);
}
