/**
 * Source contracts: inbound + remaining trigger routes act (fire + send)
 * and never park a pending draft or stall on a human.
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect } from 'vitest';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

function read(rel: string): string {
  return readFileSync(resolve(root, rel), 'utf8');
}

const INBOUND = read('app/api/agent/inbound/route.ts');
const TOURS = read('app/api/tours/[id]/route.ts');
const DEALS = read('app/api/deals/[id]/route.ts');
const MOVE = read('lib/ai-tools/tools/move-deal-stage.ts');
const ASSIGN = read('lib/broker-assign-lead.ts');
const INBOUND_PY = read('agent/tools/inbound.py');

const ROUTES = [
  ['inbound', INBOUND],
  ['tours PATCH', TOURS],
  ['deals PATCH', DEALS],
  ['move-deal-stage', MOVE],
  ['broker-assign-lead', ASSIGN],
] as const;

describe('trigger routes act, not park', () => {
  it.each(ROUTES)('%s never writes Chippy', (_name, source) => {
    expect(source).not.toMatch(/Chippy/);
  });

  it.each(ROUTES)('%s never inserts a pending AgentDraft', (_name, source) => {
    expect(source).not.toMatch(/status:\s*['"]pending['"]/);
    expect(source).not.toMatch(/from\(['"]AgentDraft['"]\)\s*\n?\s*\.insert/);
    expect(source).not.toMatch(/table\(['"]AgentDraft['"]\)\.insert/);
  });

  it('inbound fires inbound_message and sends', () => {
    expect(INBOUND).toMatch(/fireAgentTrigger/);
    expect(INBOUND).toMatch(/event:\s*'inbound_message'/);
    expect(INBOUND).toMatch(/sendSMS/);
    expect(INBOUND).toMatch(/from '@\/lib\/sms'/);
    expect(INBOUND).toMatch(/via:\s*'trigger_send'/);
  });

  it('tour PATCH fires tour_completed and sends', () => {
    expect(TOURS).toMatch(/fireAgentTrigger/);
    expect(TOURS).toMatch(/event:\s*'tour_completed'/);
    expect(TOURS).toMatch(/body\.status === 'completed'/);
    expect(TOURS).toMatch(/sendSMS/);
    expect(TOURS).toMatch(/via:\s*'trigger_send'/);
  });

  it('deal PATCH fires deal_stage_changed through the autonomous helper', () => {
    expect(DEALS).toMatch(/fireAndSendDealStageChanged/);
    expect(DEALS).toMatch(/stageChanged/);
    expect(DEALS).not.toMatch(/requiresApproval:\s*true/);
  });

  it('move_deal_stage fires autonomously and sends', () => {
    expect(MOVE).toMatch(/requiresApproval:\s*false/);
    expect(MOVE).toMatch(/fireAgentTrigger/);
    expect(MOVE).toMatch(/event:\s*'deal_stage_changed'/);
    expect(MOVE).toMatch(/sendSMS/);
    expect(MOVE).toMatch(/via:\s*'trigger_send'/);
  });

  it('assign-lead fires new_lead and sends', () => {
    expect(ASSIGN).toMatch(/fireAgentTrigger/);
    expect(ASSIGN).toMatch(/event:\s*'new_lead'/);
    expect(ASSIGN).toMatch(/sendSMS/);
    expect(ASSIGN).toMatch(/via:\s*'trigger_send'/);
  });

  it('inbound.py sends and never parks a pending draft', () => {
    expect(INBOUND_PY).toMatch(/send_sms_now/);
    expect(INBOUND_PY).toMatch(/telnyx\.com\/v2\/messages/);
    expect(INBOUND_PY).toMatch(/"sent": sent/);
    expect(INBOUND_PY).not.toMatch(/"status": "pending"/);
    expect(INBOUND_PY).not.toMatch(/Chippy/);
    expect(INBOUND_PY).not.toMatch(/table\("AgentDraft"\)\.insert/);
  });
});
