import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect } from 'vitest';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const BOOK = readFileSync(resolve(root, 'app/api/tours/book/route.ts'), 'utf8');
const CONVERT = readFileSync(resolve(root, 'app/api/tours/convert/route.ts'), 'utf8');
const PATCH = readFileSync(resolve(root, 'app/api/tours/[id]/route.ts'), 'utf8');

describe('tour booking contact + complete invariants', () => {
  it('book and convert never raw-ilike a guest email', () => {
    expect(BOOK).toMatch(/resolveOrCreateTourContact/);
    expect(CONVERT).toMatch(/resolveOrCreateTourContact/);
    expect(BOOK).not.toMatch(/\.ilike\(\s*['"]email['"]/);
    expect(CONVERT).not.toMatch(/\.ilike\(\s*['"]email['"]/);
    expect(BOOK).not.toMatch(/Chippy/);
    expect(CONVERT).not.toMatch(/Chippy/);
  });

  it('PATCH rejects overlapping reschedules and wakes Chippi before email', () => {
    expect(PATCH).toMatch(/findActiveTourConflict/);
    expect(PATCH).toMatch(/resolveOrCreateTourContact/);
    expect(PATCH).toMatch(/fireAgentTrigger/);
    expect(PATCH).toMatch(/event:\s*'tour_completed'/);
    expect(PATCH).toMatch(/body\.status === 'completed'/);
    expect(PATCH).toMatch(/tourId:\s*data\.id/);
    expect(PATCH.indexOf('fireAgentTrigger')).toBeLessThan(PATCH.indexOf('sendTourFollowUp'));
    expect(PATCH).not.toMatch(/Chippy/);
  });
});
