import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { requireContactAccess } from '@/lib/api-auth';

/**
 * GET — Generate a plain-text formatted rental application for download.
 * Returns a text/plain document that can be saved as .txt or .pdf (via browser print).
 * A fully formatted PDF would require a library like puppeteer or react-pdf,
 * but this HTML-based approach works with browser print-to-PDF.
 */
export async function GET(req: NextRequest) {
  const contactId = req.nextUrl.searchParams.get('contactId');
  if (!contactId) return NextResponse.json({ error: 'contactId required' }, { status: 400 });

  const auth = await requireContactAccess(contactId);
  if (auth instanceof NextResponse) return auth;

  const { data: contact } = await supabase
    .from('Contact')
    .select('*')
    .eq('id', contactId)
    .single();

  if (!contact) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const app = contact.applicationData as Record<string, any> | null;
  if (!app) return NextResponse.json({ error: 'No application data' }, { status: 400 });

  const { data: settings } = await supabase
    .from('SpaceSetting')
    .select('businessName')
    .eq('spaceId', contact.spaceId)
    .maybeSingle();

  const { data: space } = await supabase
    .from('Space')
    .select('name')
    .eq('id', contact.spaceId)
    .maybeSingle();

  const businessName = settings?.businessName || space?.name || 'Property Management';
  const date = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

  const fmt = (v: any, prefix = '') => v != null && v !== '' ? `${prefix}${v}` : '—';
  const fmtBool = (v: any) => v === true ? 'Yes' : v === false ? 'No' : '—';
  const fmtMoney = (v: any) => v != null ? `$${Number(v).toLocaleString()}` : '—';

  const html = `<!DOCTYPE html>
<html><head>
<meta charset="utf-8">
<title>Rental Application — ${contact.name}</title>
<style>
  @media print { body { margin: 0; } .no-print { display: none; } }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 800px; margin: 0 auto; padding: 40px 30px; color: #1a1a1a; font-size: 13px; line-height: 1.5; }
  h1 { font-size: 22px; margin: 0 0 4px; }
  h2 { font-size: 14px; text-transform: uppercase; letter-spacing: 1px; color: #666; border-bottom: 2px solid #eee; padding-bottom: 6px; margin-top: 28px; }
  .header { text-align: center; margin-bottom: 30px; padding-bottom: 20px; border-bottom: 3px solid #333; }
  .header p { margin: 2px 0; color: #666; font-size: 12px; }
  table { width: 100%; border-collapse: collapse; margin-top: 8px; }
  td { padding: 6px 12px; vertical-align: top; }
  td:first-child { font-weight: 600; width: 180px; color: #555; }
  tr:nth-child(even) { background: #f9f9f9; }
  .flag { color: #dc2626; font-weight: 700; }
  .score-badge { display: inline-block; padding: 2px 10px; border-radius: 10px; font-weight: 700; font-size: 11px; text-transform: uppercase; }
  .score-hot { background: #d1fae5; color: #065f46; }
  .score-warm { background: #fef3c7; color: #92400e; }
  .score-cold { background: #f1f5f9; color: #475569; }
  .print-btn { position: fixed; top: 20px; right: 20px; background: #2563eb; color: white; border: none; padding: 10px 20px; border-radius: 8px; font-size: 14px; cursor: pointer; }
  .print-btn:hover { background: #1d4ed8; }
  .footer { margin-top: 40px; padding-top: 20px; border-top: 2px solid #eee; text-align: center; color: #999; font-size: 11px; }
  .signature { margin-top: 30px; padding: 16px; border: 1px solid #ddd; border-radius: 8px; }
  .signature .sig-name { font-size: 18px; font-family: 'Georgia', serif; font-style: italic; }
</style>
</head><body>
<button class="print-btn no-print" onclick="window.print()">Print / Save as PDF</button>
<div class="header">
  <h1>Rental Application</h1>
  <p>${businessName}</p>
  <p>Generated ${date}</p>
</div>

${contact.leadScore != null ? `
<div style="text-align:center;margin-bottom:20px;">
  <span style="font-size:28px;font-weight:800;">${Math.round(contact.leadScore)}</span>
  <span class="score-badge score-${contact.scoreLabel || 'cold'}">${contact.scoreLabel || 'unscored'}</span>
  ${contact.scoreSummary ? `<p style="color:#666;font-size:12px;margin-top:4px;">${contact.scoreSummary}</p>` : ''}
</div>` : ''}

<h2>Applicant Information</h2>
<table>
  <tr><td>Full Name</td><td>${fmt(contact.name)}</td></tr>
  <tr><td>Email</td><td>${fmt(contact.email)}</td></tr>
  <tr><td>Phone</td><td>${fmt(contact.phone)}</td></tr>
  <tr><td>Date of Birth</td><td>${fmt(app.dateOfBirth)}</td></tr>
</table>

<h2>Property</h2>
<table>
  <tr><td>Property Address</td><td>${fmt(app.propertyAddress)}</td></tr>
  <tr><td>Unit Type</td><td>${fmt(app.unitType)}</td></tr>
  <tr><td>Target Move-in</td><td>${fmt(app.targetMoveInDate)}</td></tr>
  <tr><td>Monthly Rent</td><td>${fmtMoney(app.monthlyRent)}</td></tr>
  <tr><td>Lease Term</td><td>${fmt(app.leaseTermPreference)}</td></tr>
  <tr><td>Occupants</td><td>${fmt(app.numberOfOccupants)}</td></tr>
</table>

<h2>Current Living Situation</h2>
<table>
  <tr><td>Current Address</td><td>${fmt(app.currentAddress)}</td></tr>
  <tr><td>Housing Status</td><td>${fmt(app.currentHousingStatus)}</td></tr>
  <tr><td>Monthly Payment</td><td>${fmtMoney(app.currentMonthlyPayment)}</td></tr>
  <tr><td>Length of Residence</td><td>${fmt(app.lengthOfResidence)}</td></tr>
  <tr><td>Reason for Moving</td><td>${fmt(app.reasonForMoving)}</td></tr>
</table>

<h2>Household</h2>
<table>
  <tr><td>Adults</td><td>${fmt(app.adultsOnApplication)}</td></tr>
  <tr><td>Children/Dependents</td><td>${fmt(app.childrenOrDependents)}</td></tr>
  <tr><td>Co-Renters</td><td>${fmt(app.coRenters)}</td></tr>
  <tr><td>Emergency Contact</td><td>${fmt(app.emergencyContactName)}${app.emergencyContactPhone ? ` — ${app.emergencyContactPhone}` : ''}</td></tr>
</table>

<h2>Income &amp; Employment</h2>
<table>
  <tr><td>Employment Status</td><td>${fmt(app.employmentStatus)}</td></tr>
  <tr><td>Employer/Source</td><td>${fmt(app.employerOrSource)}</td></tr>
  <tr><td>Monthly Gross Income</td><td>${fmtMoney(app.monthlyGrossIncome)}</td></tr>
  <tr><td>Additional Income</td><td>${fmtMoney(app.additionalIncome)}</td></tr>
  ${app.monthlyGrossIncome && (app.monthlyRent || contact.budget) ? `<tr><td>Income-to-Rent Ratio</td><td><strong>${(Number(app.monthlyGrossIncome) / Number(app.monthlyRent || contact.budget)).toFixed(1)}x</strong></td></tr>` : ''}
</table>

<h2>Rental History</h2>
<table>
  <tr><td>Current Landlord</td><td>${fmt(app.currentLandlordName)}${app.currentLandlordPhone ? ` — ${app.currentLandlordPhone}` : ''}</td></tr>
  <tr><td>Previous Landlord</td><td>${fmt(app.previousLandlordName)}${app.previousLandlordPhone ? ` — ${app.previousLandlordPhone}` : ''}</td></tr>
  <tr><td>Current Rent Paid</td><td>${fmtMoney(app.currentRentPaid)}</td></tr>
  <tr><td>Late Payments</td><td${app.latePayments ? ' class="flag"' : ''}>${fmtBool(app.latePayments)}</td></tr>
  <tr><td>Lease Violations</td><td${app.leaseViolations ? ' class="flag"' : ''}>${fmtBool(app.leaseViolations)}</td></tr>
  <tr><td>Contact References</td><td>${fmtBool(app.permissionToContactReferences)}</td></tr>
</table>

<h2>Screening</h2>
<table>
  <tr><td>Prior Evictions</td><td${app.priorEvictions ? ' class="flag"' : ''}>${fmtBool(app.priorEvictions)}</td></tr>
  <tr><td>Outstanding Balances</td><td${app.outstandingBalances ? ' class="flag"' : ''}>${fmtBool(app.outstandingBalances)}</td></tr>
  <tr><td>Bankruptcy (7 yrs)</td><td${app.bankruptcy ? ' class="flag"' : ''}>${fmtBool(app.bankruptcy)}</td></tr>
  <tr><td>Background Check</td><td>${fmtBool(app.backgroundAcknowledgment)}</td></tr>
  <tr><td>Smoking</td><td>${fmtBool(app.smoking)}</td></tr>
  <tr><td>Pets</td><td>${app.hasPets ? `Yes${app.petDetails ? ` — ${app.petDetails}` : ''}` : fmtBool(app.hasPets)}</td></tr>
</table>

${app.additionalNotes ? `
<h2>Additional Notes</h2>
<p>${app.additionalNotes}</p>` : ''}

<div class="signature">
  <table style="margin:0">
    <tr><td>Screening Consent</td><td>${fmtBool(app.consentToScreening)}</td></tr>
    <tr><td>Certification</td><td>${fmtBool(app.truthfulnessCertification)}</td></tr>
    <tr><td>Electronic Signature</td><td><span class="sig-name">${fmt(app.electronicSignature)}</span></td></tr>
    <tr><td>Submitted</td><td>${app.submittedAt ? new Date(app.submittedAt).toLocaleString('en-US') : fmt(null)}</td></tr>
  </table>
</div>

<div class="footer">
  <p>This document was generated from ${businessName}'s CRM. Application ID: ${contact.id}</p>
</div>
</body></html>`;

  return new NextResponse(html, {
    status: 200,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
    },
  });
}
