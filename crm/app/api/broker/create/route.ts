import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { supabase } from '@/lib/supabase';
import { checkRateLimit } from '@/lib/rate-limit';
import { audit } from '@/lib/audit';

/**
 * POST /api/broker/create
 * Self-serve brokerage creation. Any authenticated, onboarded realtor can create
 * one brokerage. Enforced by the UNIQUE index on Brokerage.ownerId.
 */
export async function POST(req: Request) {
  const { userId: clerkId } = await auth();
  if (!clerkId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // 3 attempts per user per day
  const { allowed } = await checkRateLimit(`broker:create:${clerkId}`, 3, 86400);
  if (!allowed) return NextResponse.json({ error: 'Too many attempts. Try again tomorrow.' }, { status: 429 });

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { name, logoUrl, websiteUrl, officeAddress, officePhone, agentCount, brokerageType, primaryMarket, commissionStructure, geographicCoverage } = body as {
    name?: string;
    logoUrl?: string;
    websiteUrl?: string;
    officeAddress?: string;
    officePhone?: string;
    agentCount?: string;
    brokerageType?: string;
    primaryMarket?: string;
    commissionStructure?: string;
    geographicCoverage?: string;
  };

  const trimmedName = (typeof name === 'string' ? name : '').trim();
  if (!trimmedName || trimmedName.length > 120) {
    return NextResponse.json({ error: 'Brokerage name required (max 120 chars)' }, { status: 400 });
  }

  // Validate enum fields
  const validBrokerageTypes = ['independent', 'franchise', 'virtual'];
  const validMarkets = ['residential_rental', 'commercial', 'mixed'];
  const validCommissions = ['flat_fee', 'percentage_split', 'hybrid'];
  if (brokerageType && !validBrokerageTypes.includes(brokerageType)) {
    return NextResponse.json({ error: `Invalid brokerageType. Must be one of: ${validBrokerageTypes.join(', ')}` }, { status: 400 });
  }
  if (primaryMarket && !validMarkets.includes(primaryMarket)) {
    return NextResponse.json({ error: `Invalid primaryMarket. Must be one of: ${validMarkets.join(', ')}` }, { status: 400 });
  }
  if (commissionStructure && !validCommissions.includes(commissionStructure)) {
    return NextResponse.json({ error: `Invalid commissionStructure. Must be one of: ${validCommissions.join(', ')}` }, { status: 400 });
  }

  // Resolve internal user id
  const { data: user, error: userErr } = await supabase
    .from('User')
    .select('id, onboard, accountType')
    .eq('clerkId', clerkId)
    .maybeSingle();
  if (userErr || !user) return NextResponse.json({ error: 'User not found' }, { status: 404 });
  // Broker-only users are marked onboard during setup even without a Space
  if (!user.onboard) return NextResponse.json({ error: 'Complete onboarding first' }, { status: 403 });
  // Only users who selected broker role during onboarding can create a brokerage
  if (user.accountType === 'realtor') {
    return NextResponse.json({ error: 'Upgrade to a broker account to create a brokerage' }, { status: 403 });
  }

  // Check: does this user already own a brokerage?
  const { data: existing } = await supabase
    .from('Brokerage')
    .select('id')
    .eq('ownerId', user.id)
    .maybeSingle();
  if (existing) return NextResponse.json({ error: 'You already own a brokerage' }, { status: 409 });

  // Direct inserts instead of RPC — avoids ambiguous function overload issues
  // when multiple versions of create_brokerage_with_owner exist in the database.
  const brokerageId = crypto.randomUUID();

  const { data: brokerage, error: insertErr } = await supabase
    .from('Brokerage')
    .insert({
      id: brokerageId,
      name: trimmedName,
      ownerId: user.id,
      ...(logoUrl && { logoUrl: String(logoUrl).slice(0, 500) }),
      ...(websiteUrl && { websiteUrl: String(websiteUrl).slice(0, 500) }),
      ...(officeAddress && { officeAddress: String(officeAddress).slice(0, 500) }),
      ...(officePhone && { officePhone: String(officePhone).slice(0, 40) }),
      ...(agentCount && { agentCount: String(agentCount).slice(0, 20) }),
      ...(brokerageType && { brokerageType }),
      ...(primaryMarket && { primaryMarket }),
      ...(commissionStructure && { commissionStructure }),
      ...(geographicCoverage && { geographicCoverage: String(geographicCoverage).slice(0, 500) }),
    })
    .select()
    .single();

  if (insertErr) {
    // Check if user already owns a brokerage (race condition with unique index)
    const errMsg = insertErr.message || '';
    if (errMsg.includes('duplicate key') || errMsg.includes('unique') || insertErr.code === '23505') {
      return NextResponse.json({ error: 'You already own a brokerage' }, { status: 409 });
    }
    console.error('[broker/create] Brokerage insert failed:', insertErr);
    return NextResponse.json({ error: 'Failed to create brokerage' }, { status: 500 });
  }

  // Create the owner membership
  const { error: membershipErr } = await supabase
    .from('BrokerageMembership')
    .insert({
      id: crypto.randomUUID(),
      brokerageId,
      userId: user.id,
      role: 'broker_owner',
    });

  if (membershipErr) {
    console.error('[broker/create] BrokerageMembership insert failed:', membershipErr);
    // Rollback: delete the brokerage we just created since it's unusable without an owner membership
    await supabase.from('Brokerage').delete().eq('id', brokerageId);
    return NextResponse.json({ error: 'Failed to create brokerage membership' }, { status: 500 });
  }

  void audit({ actorClerkId: clerkId, action: 'CREATE', resource: 'Brokerage', resourceId: brokerageId, metadata: { name: trimmedName } });

  return NextResponse.json({ brokerage }, { status: 201 });
}
