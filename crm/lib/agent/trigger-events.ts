export type TriggerStatus = 'deduped' | 'queued' | 'queued_modal' | 'replayed';

export interface TriggerEventLog {
  event: string;
  contactId: string | null;
  dealId: string | null;
  status: TriggerStatus;
  at: string;
}

export function parseTriggerEventLog(raw: string): TriggerEventLog | null {
  try {
    const parsed = JSON.parse(raw) as Partial<TriggerEventLog>;
    if (!parsed || typeof parsed !== 'object') return null;
    if (typeof parsed.event !== 'string') return null;
    if (typeof parsed.at !== 'string') return null;
    const status = parsed.status;
    if (status !== 'deduped' && status !== 'queued' && status !== 'queued_modal' && status !== 'replayed') {
      return null;
    }
    return {
      event: parsed.event,
      contactId: parsed.contactId ?? null,
      dealId: parsed.dealId ?? null,
      status,
      at: parsed.at,
    };
  } catch {
    return null;
  }
}
