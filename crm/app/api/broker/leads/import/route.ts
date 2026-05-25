import { NextRequest, NextResponse } from 'next/server';
import { requireBroker } from '@/lib/permissions';
import { supabase } from '@/lib/supabase';
import { checkRateLimit } from '@/lib/rate-limit';

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
const MAX_ROWS = 1000;

/**
 * POST /api/broker/leads/import
 * Import leads from a CSV file upload.
 * Auth: broker_owner / broker_admin only.
 */
export async function POST(req: NextRequest) {
  let ctx;
  try {
    ctx = await requireBroker();
  } catch {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { brokerage } = ctx;

  // ── Rate limit ──────────────────────────────────────────────────────────
  const { allowed } = await checkRateLimit(`broker-import:${brokerage.id}`, 5, 3600);
  if (!allowed) {
    return NextResponse.json(
      { error: 'Rate limit exceeded. Maximum 5 imports per hour.' },
      { status: 429 },
    );
  }

  // ── Parse form data ─────────────────────────────────────────────────────
  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ error: 'Invalid form data' }, { status: 400 });
  }

  const file = formData.get('file') as File | null;
  if (!file) {
    return NextResponse.json({ error: 'No file provided' }, { status: 400 });
  }

  if (file.size > MAX_FILE_SIZE) {
    return NextResponse.json(
      { error: `File too large. Maximum size is 5MB.` },
      { status: 400 },
    );
  }

  const csvText = await file.text();
  const lines = csvText.split(/\r?\n/).filter((line) => line.trim().length > 0);

  if (lines.length < 2) {
    return NextResponse.json(
      { error: 'CSV must contain a header row and at least one data row.' },
      { status: 400 },
    );
  }

  // ── Parse headers ───────────────────────────────────────────────────────
  const headerLine = lines[0];
  const headers = parseCSVRow(headerLine).map((h) => h.trim().toLowerCase());

  const colIdx = {
    name: headers.indexOf('name'),
    email: headers.indexOf('email'),
    phone: headers.indexOf('phone'),
    leadType: findIndex(headers, ['lead type', 'leadtype', 'lead_type']),
    budget: headers.indexOf('budget'),
    address: findIndex(headers, ['property address', 'address', 'propertyaddress']),
    notes: headers.indexOf('notes'),
    moveInDate: findIndex(headers, ['move-in date', 'moveindate', 'move_in_date', 'movein']),
    assignTo: findIndex(headers, ['assign to', 'assignto', 'assign_to']),
  };

  if (colIdx.name === -1) {
    return NextResponse.json(
      { error: 'CSV must have a "Name" column.' },
      { status: 400 },
    );
  }

  if (colIdx.email === -1 && colIdx.phone === -1) {
    return NextResponse.json(
      { error: 'CSV must have at least one of "Email" or "Phone" columns.' },
      { status: 400 },
    );
  }

  const dataLines = lines.slice(1);
  if (dataLines.length > MAX_ROWS) {
    return NextResponse.json(
      { error: `Too many rows. Maximum is ${MAX_ROWS} per import.` },
      { status: 400 },
    );
  }

  // ── Fetch members & spaces for assignment ──────────────────────────────
  const { data: memberships } = await supabase
    .from('BrokerageMembership')
    .select('userId')
    .eq('brokerageId', brokerage.id);

  const memberUserIds = (memberships ?? []).map((m: any) => m.userId).filter(Boolean);
  let memberUsers: any[] = [];
  if (memberUserIds.length > 0) {
    const { data } = await supabase.from('User').select('id, email').in('id', memberUserIds);
    memberUsers = data ?? [];
  }
  const userEmailMap = new Map(memberUsers.map((u: any) => [u.id, u.email]));

  const membersByEmail: Record<string, string> = {};
  for (const m of (memberships ?? []) as Array<{ userId: string }>) {
    const email = userEmailMap.get(m.userId);
    if (email) {
      membersByEmail[email.toLowerCase()] = m.userId;
    }
  }

  // Get all member user IDs and their spaces
  const allMemberUserIds = (memberships ?? []).map((m: { userId: string }) => m.userId);
  const { data: allSpaces } = await supabase
    .from('Space')
    .select('id, ownerId')
    .in('ownerId', allMemberUserIds.length > 0 ? allMemberUserIds : ['__none__']);

  const spaceByOwner: Record<string, string> = {};
  for (const sp of allSpaces ?? []) {
    spaceByOwner[sp.ownerId] = sp.id;
  }

  // Default space: the brokerage owner's space
  const defaultSpaceId = spaceByOwner[brokerage.ownerId] ?? null;
  if (!defaultSpaceId) {
    return NextResponse.json(
      { error: 'Brokerage owner does not have a workspace configured.' },
      { status: 500 },
    );
  }

  // ── Process rows ───────────────────────────────────────────────────────
  let imported = 0;
  let skipped = 0;
  const errors: string[] = [];
  const contactsToInsert: Array<Record<string, unknown>> = [];

  for (let i = 0; i < dataLines.length; i++) {
    const rowNum = i + 2; // 1-indexed, account for header
    const fields = parseCSVRow(dataLines[i]);

    const name = fields[colIdx.name]?.trim() ?? '';
    const email = colIdx.email !== -1 ? fields[colIdx.email]?.trim() ?? '' : '';
    const phone = colIdx.phone !== -1 ? fields[colIdx.phone]?.trim() ?? '' : '';

    // Validate required fields
    if (!name) {
      errors.push(`Row ${rowNum}: Name is required.`);
      skipped++;
      continue;
    }
    if (!email && !phone) {
      errors.push(`Row ${rowNum}: At least one of Email or Phone is required.`);
      skipped++;
      continue;
    }

    const leadType = colIdx.leadType !== -1 ? (fields[colIdx.leadType]?.trim().toLowerCase() || 'rental') : 'rental';
    if (leadType !== 'rental' && leadType !== 'buyer') {
      errors.push(`Row ${rowNum}: Invalid lead type "${leadType}". Must be "rental" or "buyer".`);
      skipped++;
      continue;
    }

    const budgetRaw = colIdx.budget !== -1 ? fields[colIdx.budget]?.trim() ?? '' : '';
    const budget = budgetRaw ? parseFloat(budgetRaw.replace(/[^0-9.\-]/g, '')) : null;
    if (budgetRaw && (budget === null || isNaN(budget))) {
      errors.push(`Row ${rowNum}: Invalid budget value "${budgetRaw}".`);
      skipped++;
      continue;
    }

    const address = colIdx.address !== -1 ? fields[colIdx.address]?.trim() ?? '' : '';
    const notes = colIdx.notes !== -1 ? fields[colIdx.notes]?.trim() ?? '' : '';
    const moveInDate = colIdx.moveInDate !== -1 ? fields[colIdx.moveInDate]?.trim() ?? '' : '';
    const assignTo = colIdx.assignTo !== -1 ? fields[colIdx.assignTo]?.trim().toLowerCase() ?? '' : '';

    // Resolve target space
    let targetSpaceId = defaultSpaceId;
    if (assignTo) {
      const targetUserId = membersByEmail[assignTo];
      if (!targetUserId) {
        errors.push(`Row ${rowNum}: Member "${assignTo}" not found in brokerage. Using default.`);
      } else {
        const memberSpace = spaceByOwner[targetUserId];
        if (!memberSpace) {
          errors.push(`Row ${rowNum}: Member "${assignTo}" has no workspace. Using default.`);
        } else {
          targetSpaceId = memberSpace;
        }
      }
    }

    const applicationData: Record<string, string> = {};
    if (moveInDate) applicationData.moveInDate = moveInDate;

    contactsToInsert.push({
      id: crypto.randomUUID(),
      spaceId: targetSpaceId,
      brokerageId: brokerage.id,
      name,
      email: email || null,
      phone: phone || null,
      leadType,
      budget: budget,
      address: address || null,
      notes: notes || null,
      type: 'QUALIFICATION',
      tags: ['new-lead', 'imported', 'brokerage-lead'],
      scoringStatus: 'pending',
      applicationData: Object.keys(applicationData).length > 0 ? applicationData : null,
      properties: [],
    });
  }

  // ── Batch insert ──────────────────────────────────────────────────────
  if (contactsToInsert.length > 0) {
    // Insert in batches of 100 to stay within Supabase limits
    const BATCH_SIZE = 100;
    for (let i = 0; i < contactsToInsert.length; i += BATCH_SIZE) {
      const batch = contactsToInsert.slice(i, i + BATCH_SIZE);
      const { error: insertError } = await supabase.from('Contact').insert(batch);
      if (insertError) {
        console.error('[broker/leads/import] insert error', insertError);
        const batchStart = i + 2;
        const batchEnd = Math.min(i + BATCH_SIZE, contactsToInsert.length) + 1;
        errors.push(`Failed to insert rows ${batchStart}-${batchEnd}: ${insertError.message}`);
        skipped += batch.length;
        continue;
      }
      imported += batch.length;
    }
  }

  return NextResponse.json({
    imported,
    skipped,
    errors,
  });
}

// ── CSV parsing helpers ─────────────────────────────────────────────────────

function parseCSVRow(line: string): string[] {
  const fields: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (i + 1 < line.length && line[i + 1] === '"') {
          current += '"';
          i++; // skip escaped quote
        } else {
          inQuotes = false;
        }
      } else {
        current += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === ',') {
        fields.push(current);
        current = '';
      } else {
        current += ch;
      }
    }
  }
  fields.push(current);
  return fields;
}

function findIndex(headers: string[], candidates: string[]): number {
  for (const c of candidates) {
    const idx = headers.indexOf(c);
    if (idx !== -1) return idx;
  }
  return -1;
}
