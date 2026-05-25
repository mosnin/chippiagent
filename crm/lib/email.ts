import type { ApplicationData, IntakeFormConfig } from '@/lib/types';
import { getSubmissionDisplay, formatAnswerValue } from '@/lib/form-versioning';
import { logger } from '@/lib/logger';

/**
 * Normalize RESEND_FROM_EMAIL — if someone sets it to just a domain like
 * "alerts.usechippi.com" instead of "notifications@alerts.usechippi.com",
 * fix it automatically.
 */
function getFromAddress(): string {
  const raw = process.env.RESEND_FROM_EMAIL ?? 'notifications@alerts.usechippi.com';
  if (raw.includes('@')) return raw;
  // It's just a domain — prepend "notifications@"
  return `notifications@${raw}`;
}

/** Escape characters that have special meaning in HTML to prevent XSS. */
function esc(value: string | null | undefined): string {
  if (!value) return '';
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');
}

function fmt(n: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);
}

function row(label: string, value: string | number | boolean | null | undefined) {
  if (value == null || value === '') return '';
  const display = typeof value === 'boolean' ? (value ? 'Yes' : 'No') : esc(String(value));
  return `<tr><td style="padding:4px 12px 4px 0;color:#6b7280;font-size:13px;white-space:nowrap">${esc(label)}</td><td style="padding:4px 0;font-size:13px;color:#111827">${display}</td></tr>`;
}

export interface NewLeadEmailParams {
  toEmail: string;
  spaceName: string;
  spaceSlug: string;
  contactId: string;
  name: string;
  phone: string;
  email?: string | null;
  budget?: number | null;
  leadScore?: number | null;
  scoreLabel?: string | null;
  scoreSummary?: string | null;
  applicationData: ApplicationData;
  /** If present, render dynamic form Q&A instead of hardcoded fields */
  formConfigSnapshot?: IntakeFormConfig | null;
}

export async function sendNewLeadNotification(params: NewLeadEmailParams): Promise<void> {
  if (!process.env.RESEND_API_KEY) {
    logger.warn('[email] RESEND_API_KEY not set — skipping email');
    return;
  }
  const { Resend } = await import('resend');
  const resend = new Resend(process.env.RESEND_API_KEY);
  const FROM = getFromAddress();

  const { toEmail, spaceName, spaceSlug, contactId, name, phone, email, budget, leadScore, scoreLabel, scoreSummary, applicationData: app, formConfigSnapshot } = params;

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://my.usechippi.com';
  const contactUrl = `${appUrl}/s/${spaceSlug}/contacts/${contactId}`;

  const tierColor = scoreLabel === 'hot' ? '#059669' : scoreLabel === 'warm' ? '#d97706' : '#6b7280';
  const scoreHtml = leadScore != null
    ? `<span style="display:inline-block;background:${tierColor}1a;color:${tierColor};font-size:12px;font-weight:600;padding:2px 10px;border-radius:9999px;text-transform:uppercase">${Math.round(leadScore)} ${scoreLabel ?? ''}</span>`
    : '';

  let detailRows: string;

  if (formConfigSnapshot?.sections && app) {
    // ── Dynamic form: render Q&A pairs from snapshot ──────────────────
    const displayFields = getSubmissionDisplay({
      applicationData: app as Record<string, any>,
      formConfigSnapshot,
    });
    detailRows = [
      row('Phone', phone),
      row('Email', email),
      row('Budget', budget != null ? fmt(budget) : null),
      ...displayFields.map((f) => row(f.label, f.value)),
    ].filter(Boolean).join('');
  } else {
    // ── Legacy: hardcoded fields ─────────────────────────────────────
    detailRows = [
      row('Phone', phone),
      row('Email', email),
      row('Budget', budget != null ? fmt(budget) : null),
      row('Property', app.propertyAddress),
      row('Move-in date', app.targetMoveInDate),
      row('Monthly rent', app.monthlyRent != null ? fmt(Number(app.monthlyRent)) : null),
      row('Employment', app.employmentStatus),
      row('Gross income', app.monthlyGrossIncome != null ? `${fmt(Number(app.monthlyGrossIncome))}/mo` : null),
      row('Occupants', app.numberOfOccupants),
      row('Pets', app.hasPets === true ? (app.petDetails ?? 'Yes') : app.hasPets === false ? 'No' : null),
      row('Prior evictions', app.priorEvictions),
    ].filter(Boolean).join('');
  }

  const html = `
<!DOCTYPE html>
<html>
<body style="margin:0;padding:0;background:#f9fafb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f9fafb;padding:32px 16px">
    <tr><td align="center">
      <table width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border-radius:12px;border:1px solid #e5e7eb;overflow:hidden">
        <!-- Header -->
        <tr><td style="background:#0f172a;padding:20px 28px">
          <p style="margin:0;color:#94a3b8;font-size:12px;font-weight:500;text-transform:uppercase;letter-spacing:.05em">${esc(spaceName)}</p>
          <p style="margin:4px 0 0;color:#ffffff;font-size:20px;font-weight:700">New lead application</p>
        </td></tr>
        <!-- Body -->
        <tr><td style="padding:24px 28px">
          <!-- Name + score -->
          <table width="100%" cellpadding="0" cellspacing="0">
            <tr>
              <td><p style="margin:0;font-size:18px;font-weight:700;color:#111827">${esc(name)}</p></td>
              ${scoreHtml ? `<td align="right" style="vertical-align:middle">${scoreHtml}</td>` : ''}
            </tr>
          </table>
          ${scoreSummary ? `<p style="margin:10px 0 0;font-size:13px;color:#4b5563;line-height:1.5">${esc(scoreSummary)}</p>` : ''}
          <!-- Details table -->
          ${detailRows ? `<table cellpadding="0" cellspacing="0" style="margin-top:18px;width:100%">${detailRows}</table>` : ''}
          <!-- CTA -->
          <table width="100%" cellpadding="0" cellspacing="0" style="margin-top:24px">
            <tr><td>
              <a href="${contactUrl}" style="display:inline-block;background:#0f172a;color:#ffffff;font-size:14px;font-weight:600;text-decoration:none;padding:10px 22px;border-radius:8px">View full application →</a>
            </td></tr>
          </table>
        </td></tr>
        <!-- Footer -->
        <tr><td style="padding:16px 28px;border-top:1px solid #f1f5f9">
          <p style="margin:0;font-size:11px;color:#9ca3af">You're receiving this because notifications are enabled for <strong>${esc(spaceName)}</strong>. Manage your settings in the workspace dashboard.</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

  // Strip control characters (newlines, carriage returns) from subject-line values
  // to prevent email header injection
  const safeSubjectName = name.replace(/[\r\n\t]/g, ' ').slice(0, 200);
  const safeScoreLabel = (scoreLabel ?? '').replace(/[\r\n\t]/g, ' ');

  try {
    const result = await resend.emails.send({
      from: FROM,
      to: toEmail,
      subject: `New lead: ${safeSubjectName}${leadScore != null ? ` · ${Math.round(leadScore)} ${safeScoreLabel}` : ''}`,
      html,
    });
    if (result.error) {
      logger.error('[email] new lead: Resend API error', { to: toEmail, resendError: result.error });
    } else {
      logger.info('[email] new lead sent', { to: toEmail, messageId: result.data?.id });
    }
  } catch (err) {
    logger.error('[email] new lead send failed', { to: toEmail }, err);
  }
}

export interface FollowUpDigestParams {
  toEmail: string;
  spaceName: string;
  spaceSlug: string;
  contacts: { name: string; phone: string | null; followUpAt: string | null }[];
}

export async function sendFollowUpDigest(params: FollowUpDigestParams): Promise<void> {
  if (!process.env.RESEND_API_KEY) { logger.warn('[email] RESEND_API_KEY not set — skipping'); return; }
  const { Resend } = await import('resend');
  const resend = new Resend(process.env.RESEND_API_KEY);
  const FROM = getFromAddress();

  const { toEmail, spaceName, spaceSlug, contacts } = params;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://my.usechippi.com';
  const leadsUrl = `${appUrl}/s/${spaceSlug}/leads`;

  const contactRows = contacts
    .map((c) => {
      const dateStr = c.followUpAt ? new Date(c.followUpAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '';
      return `<tr>
        <td style="padding:6px 12px 6px 0;font-size:13px;color:#111827;font-weight:500">${esc(c.name)}</td>
        <td style="padding:6px 12px 6px 0;font-size:13px;color:#6b7280">${c.phone ? esc(c.phone) : '—'}</td>
        <td style="padding:6px 0;font-size:13px;color:#d97706;font-weight:500">${dateStr}</td>
      </tr>`;
    })
    .join('');

  const html = `
<!DOCTYPE html>
<html>
<body style="margin:0;padding:0;background:#f9fafb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f9fafb;padding:32px 16px">
    <tr><td align="center">
      <table width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border-radius:12px;border:1px solid #e5e7eb;overflow:hidden">
        <tr><td style="background:#0f172a;padding:20px 28px">
          <p style="margin:0;color:#94a3b8;font-size:12px;font-weight:500;text-transform:uppercase;letter-spacing:.05em">${esc(spaceName)}</p>
          <p style="margin:4px 0 0;color:#ffffff;font-size:20px;font-weight:700">Follow-up reminders</p>
        </td></tr>
        <tr><td style="padding:24px 28px">
          <p style="margin:0 0 16px;font-size:14px;color:#374151">You have <strong>${contacts.length}</strong> follow-up${contacts.length !== 1 ? 's' : ''} due today:</p>
          <table cellpadding="0" cellspacing="0" style="width:100%;border-top:1px solid #f1f5f9">
            <thead>
              <tr>
                <th style="padding:8px 12px 8px 0;text-align:left;font-size:11px;color:#9ca3af;font-weight:600;text-transform:uppercase;letter-spacing:.04em">Name</th>
                <th style="padding:8px 12px 8px 0;text-align:left;font-size:11px;color:#9ca3af;font-weight:600;text-transform:uppercase;letter-spacing:.04em">Phone</th>
                <th style="padding:8px 0;text-align:left;font-size:11px;color:#9ca3af;font-weight:600;text-transform:uppercase;letter-spacing:.04em">Due</th>
              </tr>
            </thead>
            <tbody>${contactRows}</tbody>
          </table>
          <table width="100%" cellpadding="0" cellspacing="0" style="margin-top:24px">
            <tr><td>
              <a href="${leadsUrl}" style="display:inline-block;background:#0f172a;color:#ffffff;font-size:14px;font-weight:600;text-decoration:none;padding:10px 22px;border-radius:8px">View leads →</a>
            </td></tr>
          </table>
        </td></tr>
        <tr><td style="padding:16px 28px;border-top:1px solid #f1f5f9">
          <p style="margin:0;font-size:11px;color:#9ca3af">You're receiving this because notifications are enabled for <strong>${esc(spaceName)}</strong>.</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

  const safeSpaceName = spaceName.replace(/[\r\n\t]/g, ' ').slice(0, 100);
  try {
    const result = await resend.emails.send({
      from: FROM,
      to: toEmail,
      subject: `${contacts.length} follow-up${contacts.length !== 1 ? 's' : ''} due today — ${safeSpaceName}`,
      html,
    });
    if (result.error) {
      logger.error('[email] follow-up digest: Resend API error', { to: toEmail, resendError: result.error });
    } else {
      logger.info('[email] follow-up digest sent', { to: toEmail, messageId: result.data?.id });
    }
  } catch (err) {
    logger.error('[email] follow-up digest failed', { to: toEmail }, err);
  }
}

export interface SendEmailAttachment {
  /** Filename the recipient sees. */
  filename: string;
  /** Raw bytes. The caller resolves these (typically by downloading from
   *  Wasabi via the storage layer) before invoking sendEmailFromCRM. */
  content: Buffer;
  /** Optional explicit content-type. Resend infers from filename when omitted. */
  contentType?: string;
}

export interface SendEmailFromCRMParams {
  toEmail: string;
  fromName: string;
  replyTo?: string;
  subject: string;
  body: string;
  attachments?: SendEmailAttachment[];
}

export async function sendEmailFromCRM(params: SendEmailFromCRMParams): Promise<void> {
  if (!process.env.RESEND_API_KEY) { logger.warn('[email] RESEND_API_KEY not set — skipping'); return; }
  const { Resend } = await import('resend');
  const resend = new Resend(process.env.RESEND_API_KEY);
  const FROM = getFromAddress();

  const { toEmail, fromName, replyTo, subject, body, attachments } = params;

  const html = `
<!DOCTYPE html>
<html>
<body style="margin:0;padding:0;background:#f9fafb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f9fafb;padding:32px 16px">
    <tr><td align="center">
      <table width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border-radius:12px;border:1px solid #e5e7eb;overflow:hidden">
        <tr><td style="padding:28px 32px">
          <p style="margin:0;font-size:15px;color:#111827;line-height:1.7;white-space:pre-wrap">${esc(body)}</p>
        </td></tr>
        <tr><td style="padding:16px 32px;border-top:1px solid #f1f5f9">
          <p style="margin:0;font-size:12px;color:#9ca3af">Sent by ${esc(fromName)} via your property management system.</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

  const safeSubject = subject.replace(/[\r\n\t]/g, ' ').slice(0, 200);
  try {
    const result = await resend.emails.send({
      from: `${fromName.replace(/[\r\n\t<>"]/g, ' ').slice(0, 100)} <${FROM}>`,
      to: toEmail,
      replyTo: replyTo ?? undefined,
      subject: safeSubject,
      html,
      attachments: attachments && attachments.length > 0
        ? attachments.map((a) => ({
            filename: a.filename,
            content: a.content,
            contentType: a.contentType,
          }))
        : undefined,
    });
    if (result.error) {
      logger.error('[email] CRM email: Resend API error', { to: toEmail, resendError: result.error });
    } else {
      logger.info('[email] CRM email sent', { to: toEmail, messageId: result.data?.id });
    }
  } catch (err) {
    logger.error('[email] CRM email failed', { to: toEmail }, err);
  }
}

export interface NewDealEmailParams {
  toEmail: string;
  spaceName: string;
  spaceSlug: string;
  dealTitle: string;
  dealValue?: number | null;
  dealAddress?: string | null;
  dealPriority?: string | null;
  contactNames?: string[];
}

export async function sendNewDealNotification(params: NewDealEmailParams): Promise<void> {
  if (!process.env.RESEND_API_KEY) { logger.warn('[email] RESEND_API_KEY not set — skipping'); return; }
  const { Resend } = await import('resend');
  const resend = new Resend(process.env.RESEND_API_KEY);
  const FROM = getFromAddress();

  const { toEmail, spaceName, spaceSlug, dealTitle, dealValue, dealAddress, dealPriority, contactNames } = params;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://my.usechippi.com';
  const dealsUrl = `${appUrl}/s/${spaceSlug}/deals`;

  const detailRows = [
    row('Title', dealTitle),
    row('Value', dealValue != null ? fmt(dealValue) : null),
    row('Address', dealAddress),
    row('Priority', dealPriority),
    row('Contacts', contactNames?.length ? contactNames.join(', ') : null),
  ].filter(Boolean).join('');

  const html = `
<!DOCTYPE html>
<html>
<body style="margin:0;padding:0;background:#f9fafb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f9fafb;padding:32px 16px">
    <tr><td align="center">
      <table width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border-radius:12px;border:1px solid #e5e7eb;overflow:hidden">
        <tr><td style="background:#0f172a;padding:20px 28px">
          <p style="margin:0;color:#94a3b8;font-size:12px;font-weight:500;text-transform:uppercase;letter-spacing:.05em">${esc(spaceName)}</p>
          <p style="margin:4px 0 0;color:#ffffff;font-size:20px;font-weight:700">New deal created</p>
        </td></tr>
        <tr><td style="padding:24px 28px">
          <p style="margin:0;font-size:18px;font-weight:700;color:#111827">${esc(dealTitle)}</p>
          ${dealValue != null ? `<p style="margin:6px 0 0;font-size:24px;font-weight:700;color:#059669">${fmt(dealValue)}</p>` : ''}
          ${detailRows ? `<table cellpadding="0" cellspacing="0" style="margin-top:18px;width:100%">${detailRows}</table>` : ''}
          <table width="100%" cellpadding="0" cellspacing="0" style="margin-top:24px">
            <tr><td>
              <a href="${dealsUrl}" style="display:inline-block;background:#0f172a;color:#ffffff;font-size:14px;font-weight:600;text-decoration:none;padding:10px 22px;border-radius:8px">View deals →</a>
            </td></tr>
          </table>
        </td></tr>
        <tr><td style="padding:16px 28px;border-top:1px solid #f1f5f9">
          <p style="margin:0;font-size:11px;color:#9ca3af">You're receiving this because notifications are enabled for <strong>${esc(spaceName)}</strong>.</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

  const safeDealTitle = dealTitle.replace(/[\r\n\t]/g, ' ').slice(0, 200);
  try {
    const result = await resend.emails.send({
      from: FROM,
      to: toEmail,
      subject: `New deal: ${safeDealTitle}${dealValue != null ? ` · ${fmt(dealValue)}` : ''}`,
      html,
    });
    if (result.error) {
      logger.error('[email] new deal: Resend API error', { to: toEmail, resendError: result.error });
    } else {
      logger.info('[email] new deal sent', { to: toEmail, messageId: result.data?.id });
    }
  } catch (err) {
    logger.error('[email] new deal failed', { to: toEmail }, err);
  }
}

export interface BrokerageInvitationEmailParams {
  toEmail: string;
  brokerageName: string;
  inviterName: string;
  roleToAssign: 'broker_admin' | 'realtor_member';
  token: string;
}

export async function sendBrokerageInvitation(params: BrokerageInvitationEmailParams): Promise<void> {
  if (!process.env.RESEND_API_KEY) { logger.warn('[email] RESEND_API_KEY not set — skipping'); return; }
  const { Resend } = await import('resend');
  const resend = new Resend(process.env.RESEND_API_KEY);
  const FROM = getFromAddress();
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://my.usechippi.com';

  const { toEmail, brokerageName, inviterName, roleToAssign, token } = params;
  const acceptUrl = `${appUrl}/invite/${token}`;
  const roleLabel = roleToAssign === 'broker_admin' ? 'Brokerage Admin' : 'Realtor';
  const safeEmail = toEmail.replace(/[\r\n\t]/g, ' ').slice(0, 200);

  const html = `
<!DOCTYPE html>
<html>
<body style="margin:0;padding:0;background:#f9fafb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f9fafb;padding:32px 16px">
    <tr><td align="center">
      <table width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border-radius:12px;border:1px solid #e5e7eb;overflow:hidden">
        <tr><td style="background:#0f172a;padding:20px 28px">
          <p style="margin:0;color:#94a3b8;font-size:12px;font-weight:500;text-transform:uppercase;letter-spacing:.05em">Brokerage Invitation</p>
          <p style="margin:4px 0 0;color:#ffffff;font-size:20px;font-weight:700">${esc(brokerageName)}</p>
        </td></tr>
        <tr><td style="padding:24px 28px">
          <p style="margin:0;font-size:15px;color:#111827;line-height:1.6">
            <strong>${esc(inviterName)}</strong> has invited you to join <strong>${esc(brokerageName)}</strong> as a <strong>${esc(roleLabel)}</strong> on Chippi.
          </p>
          <p style="margin:12px 0 0;font-size:13px;color:#6b7280;line-height:1.5">
            You'll keep your own workspace, leads, and pipeline. This just adds you to the brokerage network.
          </p>
          <table width="100%" cellpadding="0" cellspacing="0" style="margin-top:24px">
            <tr><td>
              <a href="${acceptUrl}" style="display:inline-block;background:#0f172a;color:#ffffff;font-size:14px;font-weight:600;text-decoration:none;padding:10px 22px;border-radius:8px">Accept invitation →</a>
            </td></tr>
          </table>
          <p style="margin:16px 0 0;font-size:11px;color:#9ca3af">
            This invitation expires in 7 days. If you don't have a Chippi account yet, you'll be prompted to create one after clicking the link above.
          </p>
        </td></tr>
        <tr><td style="padding:16px 28px;border-top:1px solid #f1f5f9">
          <p style="margin:0;font-size:11px;color:#9ca3af">You received this because someone invited ${esc(safeEmail)} to a Chippi brokerage. If this was a mistake, you can ignore this email.</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

  try {
    const result = await resend.emails.send({
      from: FROM,
      to: toEmail,
      subject: `You're invited to join ${brokerageName.replace(/[\r\n\t]/g, ' ').slice(0, 100)} on Chippi`,
      html,
    });
    if (result.error) {
      logger.error('[email] brokerage invitation: Resend API error', { to: toEmail, resendError: result.error });
    } else {
      logger.info('[email] brokerage invitation sent', { to: toEmail, messageId: result.data?.id });
    }
  } catch (err) {
    logger.error('[email] brokerage invitation failed', { to: toEmail }, err);
  }
}

// ── Application confirmation email (sent to the applicant) ──────────────────

export interface ApplicationConfirmationParams {
  toEmail: string;
  applicantName: string;
  businessName: string;
  slug: string;
  applicationRef: string;
  leadType: 'rental' | 'buyer';
  /** Optional custom message from SpaceSetting.intakeConfirmationEmail */
  customMessage?: string | null;
  /** Secure token for portal access — included in status URL */
  statusPortalToken?: string | null;
}

export async function sendApplicationConfirmation(params: ApplicationConfirmationParams): Promise<void> {
  if (!process.env.RESEND_API_KEY) {
    logger.warn('[email] RESEND_API_KEY not set — skipping applicant confirmation');
    return;
  }
  const { Resend } = await import('resend');
  const resend = new Resend(process.env.RESEND_API_KEY);
  const FROM = getFromAddress();

  const { toEmail, applicantName, businessName, slug, applicationRef, leadType, customMessage, statusPortalToken } = params;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://my.usechippi.com';
  let statusUrl = `${appUrl}/apply/${encodeURIComponent(slug)}/status?ref=${encodeURIComponent(applicationRef)}`;
  if (statusPortalToken) {
    statusUrl += `&token=${encodeURIComponent(statusPortalToken)}`;
  }

  const safeBusinessName = esc(businessName);
  const safeName = esc(applicantName);
  const typeLabel = leadType === 'buyer' ? 'buyer' : 'rental';

  const bodyParagraph = customMessage
    ? esc(customMessage)
    : `We&#x27;ve received your ${typeLabel} application and will review it shortly. You don&#x27;t need to do anything else right now.`;

  const html = `
<!DOCTYPE html>
<html>
<body style="margin:0;padding:0;background:#f9fafb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f9fafb;padding:32px 16px">
    <tr><td align="center">
      <table width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border-radius:12px;border:1px solid #e5e7eb;overflow:hidden">
        <!-- Header -->
        <tr><td style="background:#0f172a;padding:20px 28px">
          <p style="margin:0;color:#ffffff;font-size:20px;font-weight:700">${safeBusinessName}</p>
        </td></tr>
        <!-- Body -->
        <tr><td style="padding:24px 28px">
          <p style="margin:0 0 16px;font-size:18px;font-weight:700;color:#111827">Thank you for your application, ${safeName}</p>
          <p style="margin:0 0 20px;font-size:14px;color:#374151;line-height:1.6">${bodyParagraph}</p>
          <!-- CTA -->
          <table width="100%" cellpadding="0" cellspacing="0">
            <tr><td>
              <a href="${statusUrl}" style="display:inline-block;background:#0f172a;color:#ffffff;font-size:14px;font-weight:600;text-decoration:none;padding:10px 22px;border-radius:8px">Track your application status &rarr;</a>
            </td></tr>
          </table>
        </td></tr>
        <!-- Footer -->
        <tr><td style="padding:16px 28px;border-top:1px solid #f1f5f9">
          <p style="margin:0;font-size:11px;color:#9ca3af">This email was sent by ${safeBusinessName} via Chippi</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

  const safeSubjectBiz = businessName.replace(/[\r\n\t]/g, ' ').slice(0, 150);

  try {
    const result = await resend.emails.send({
      from: `${businessName.replace(/[\r\n\t<>"]/g, ' ').slice(0, 100)} <${FROM}>`,
      to: toEmail,
      subject: `Application received — ${safeSubjectBiz}`,
      html,
    });
    if (result.error) {
      logger.error('[email] application confirmation: Resend API error', { to: toEmail, resendError: result.error });
    } else {
      logger.info('[email] application confirmation sent', { to: toEmail, messageId: result.data?.id });
    }
  } catch (err) {
    logger.error('[email] application confirmation failed', { to: toEmail }, err);
  }
}

// ── Welcome email ────────────────────────────────────────────────────────────

export async function sendWelcomeEmail(params: {
  toEmail: string;
  userName: string | null;
  spaceName?: string | null;
  spaceSlug?: string | null;
}): Promise<void> {
  if (!process.env.RESEND_API_KEY) { logger.warn('[email] RESEND_API_KEY not set — skipping'); return; }
  const { Resend } = await import('resend');
  const resend = new Resend(process.env.RESEND_API_KEY);
  const FROM = getFromAddress();

  const { toEmail, userName, spaceName, spaceSlug } = params;
  const name = esc(userName) || 'there';
  const domain = process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? 'my.usechippi.com';
  const dashboardUrl = spaceSlug ? `https://${domain}/s/${spaceSlug}` : `https://${domain}/setup`;

  const html = `
<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:520px;margin:0 auto;padding:32px 0">
  <div style="text-align:center;margin-bottom:28px">
    <span style="font-size:28px;font-weight:700;color:#111827">Welcome to Chippi</span>
  </div>
  <div style="background:#ffffff;border:1px solid #e5e7eb;border-radius:12px;padding:28px 24px">
    <p style="margin:0 0 16px;font-size:15px;color:#111827;line-height:1.6">
      Hi ${name},
    </p>
    <p style="margin:0 0 16px;font-size:14px;color:#374151;line-height:1.6">
      Your Chippi account is ready${spaceName ? ` and your workspace <strong>${esc(spaceName)}</strong> has been created` : ''}. Here's what you can do now:
    </p>
    <table style="width:100%;border-collapse:collapse;margin:0 0 20px">
      <tr>
        <td style="padding:8px 0;font-size:14px;color:#374151;line-height:1.5">
          <strong style="color:#111827">1. Share your intake link</strong><br/>
          Send it to renters so their inquiries flow straight into your pipeline.
        </td>
      </tr>
      <tr>
        <td style="padding:8px 0;font-size:14px;color:#374151;line-height:1.5">
          <strong style="color:#111827">2. Review AI-scored leads</strong><br/>
          Every submission is automatically scored — hot, warm, or cold.
        </td>
      </tr>
      <tr>
        <td style="padding:8px 0;font-size:14px;color:#374151;line-height:1.5">
          <strong style="color:#111827">3. Set up follow-up reminders</strong><br/>
          Never miss a callback. Chippi reminds you when to reach out.
        </td>
      </tr>
    </table>
    <div style="text-align:center;margin:24px 0 8px">
      <a href="${dashboardUrl}" style="display:inline-block;background:#ff964f;color:#ffffff;font-weight:600;font-size:14px;text-decoration:none;padding:10px 28px;border-radius:8px">
        Open your dashboard
      </a>
    </div>
  </div>
  <p style="text-align:center;font-size:12px;color:#9ca3af;margin-top:20px;line-height:1.5">
    Questions? Just reply to this email. We're here to help.<br/>
    — The Chippi team
  </p>
</div>`;

  try {
    const result = await resend.emails.send({
      from: `Chippi <${FROM}>`,
      to: toEmail,
      subject: `Welcome to Chippi — your workspace is ready`,
      html,
    });
    if (result.error) {
      logger.error('[email] welcome: Resend API error', { to: toEmail, resendError: result.error });
    } else {
      logger.info('[email] welcome sent', { to: toEmail, messageId: result.data?.id });
    }
  } catch (err) {
    logger.error('[email] welcome failed', { to: toEmail }, err);
  }
}

// ── Draft resume email (magic link to continue application) ─────────────────

export interface DraftResumeEmailParams {
  toEmail: string;
  businessName: string;
  resumeUrl: string;
}

export async function sendDraftResumeEmail(params: DraftResumeEmailParams): Promise<void> {
  if (!process.env.RESEND_API_KEY) {
    logger.warn('[email] RESEND_API_KEY not set — skipping draft resume email');
    return;
  }
  const { Resend } = await import('resend');
  const resend = new Resend(process.env.RESEND_API_KEY);
  const FROM = getFromAddress();

  const { toEmail, businessName, resumeUrl } = params;

  const safeBusinessName = esc(businessName);

  const html = `
<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f9fafb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif">
  <!-- Preheader text (visible in inbox preview, hidden in body) -->
  <div style="display:none;max-height:0;overflow:hidden;mso-hide:all">
    Your application progress has been saved. Click to pick up where you left off &#8199;&#65279;&#847;
  </div>
  <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="background:#f9fafb;padding:32px 16px">
    <tr><td align="center">
      <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="max-width:520px;background:#ffffff;border-radius:12px;border:1px solid #e5e7eb;overflow:hidden">
        <!-- Header -->
        <tr><td style="background:#111827;padding:20px 28px">
          <p style="margin:0;color:#ffffff;font-size:20px;font-weight:700">${safeBusinessName}</p>
        </td></tr>
        <!-- Body -->
        <tr><td style="padding:28px 28px 24px">
          <p style="margin:0 0 16px;font-size:18px;font-weight:700;color:#111827">Continue your application</p>
          <p style="margin:0 0 24px;font-size:14px;color:#374151;line-height:1.6">
            We saved your progress so you can pick up right where you left off. Click the button below to resume your application with ${safeBusinessName}.
          </p>
          <!-- CTA -->
          <table width="100%" cellpadding="0" cellspacing="0" role="presentation">
            <tr><td align="center">
              <a href="${resumeUrl}" style="display:inline-block;background:#111827;color:#ffffff;font-size:14px;font-weight:600;text-decoration:none;padding:14px 32px;border-radius:8px;mso-padding-alt:0;text-align:center">
                <!--[if mso]><i style="mso-font-width:150%;mso-text-raise:30px" hidden>&emsp;</i><![endif]-->
                <span style="mso-text-raise:15px">Resume Application &#8594;</span>
                <!--[if mso]><i style="mso-font-width:150%" hidden>&emsp;&#8203;</i><![endif]-->
              </a>
            </td></tr>
          </table>
          <!-- Expiry notice (prominent, not buried in footer) -->
          <p style="margin:20px 0 0;font-size:13px;color:#6b7280;line-height:1.5;text-align:center">
            This link is valid for <strong style="color:#374151">7 days</strong>.
          </p>
          <p style="margin:16px 0 0;font-size:12px;color:#9ca3af;line-height:1.5">
            Or copy and paste this link into your browser:<br/>
            <a href="${resumeUrl}" style="color:#6b7280;word-break:break-all">${resumeUrl}</a>
          </p>
        </td></tr>
        <!-- Footer -->
        <tr><td style="padding:16px 28px;border-top:1px solid #f1f5f9">
          <p style="margin:0;font-size:11px;color:#9ca3af;line-height:1.5">If you didn&rsquo;t start this application, you can safely ignore this email. Your data will be automatically deleted when the link expires.</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

  const safeSubjectBiz = businessName.replace(/[\r\n\t]/g, ' ').slice(0, 150);

  // Plain-text fallback for accessibility and text-only email clients
  const text = [
    `Continue your application with ${businessName}`,
    '',
    'We saved your progress so you can pick up right where you left off.',
    '',
    `Resume your application: ${resumeUrl}`,
    '',
    'This link is valid for 7 days.',
    '',
    "If you didn't start this application, you can safely ignore this email.",
  ].join('\n');

  try {
    const result = await resend.emails.send({
      from: `${businessName.replace(/[\r\n\t<>"]/g, ' ').slice(0, 100)} <${FROM}>`,
      to: toEmail,
      subject: `Continue your application \u2014 ${safeSubjectBiz}`,
      html,
      text,
    });
    if (result.error) {
      logger.error('[email] draft resume: Resend API error', { to: toEmail, resendError: result.error });
    } else {
      logger.info('[email] draft resume sent', { to: toEmail, messageId: result.data?.id });
    }
  } catch (err) {
    logger.error('[email] draft resume failed', { to: toEmail }, err);
  }
}

// ── MFA enrollment prompt (sent by admin action) ─────────────────────────────

export interface MfaEnrollmentPromptParams {
  toEmail: string;
  userName: string | null;
}

export async function sendMfaEnrollmentPrompt(params: MfaEnrollmentPromptParams): Promise<void> {
  if (!process.env.RESEND_API_KEY) {
    logger.warn('[email] RESEND_API_KEY not set — skipping MFA enrollment prompt');
    return;
  }
  const { Resend } = await import('resend');
  const resend = new Resend(process.env.RESEND_API_KEY);
  const FROM = getFromAddress();

  const { toEmail, userName } = params;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://my.usechippi.com';
  const accountSettingsUrl = `${appUrl}/settings/account`;
  const name = esc(userName) || 'there';

  const html = `
<!DOCTYPE html>
<html lang="en">
<body style="margin:0;padding:0;background:#f9fafb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="background:#f9fafb;padding:32px 16px">
    <tr><td align="center">
      <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="max-width:520px;background:#ffffff;border-radius:12px;border:1px solid #e5e7eb;overflow:hidden">
        <tr><td style="background:#0f172a;padding:20px 28px">
          <p style="margin:0;color:#94a3b8;font-size:12px;font-weight:500;text-transform:uppercase;letter-spacing:.05em">Account Security</p>
          <p style="margin:4px 0 0;color:#ffffff;font-size:20px;font-weight:700">Enable two-factor authentication</p>
        </td></tr>
        <tr><td style="padding:24px 28px">
          <p style="margin:0 0 16px;font-size:15px;color:#111827;line-height:1.6">Hi ${name},</p>
          <p style="margin:0 0 16px;font-size:14px;color:#374151;line-height:1.6">
            To better protect your Chippi account, we recommend enabling two-factor authentication (2FA). 2FA adds a second layer of security by requiring a verification code in addition to your password when signing in.
          </p>
          <p style="margin:0 0 20px;font-size:14px;color:#374151;line-height:1.6">
            You can set this up in under a minute from your account settings.
          </p>
          <table width="100%" cellpadding="0" cellspacing="0" role="presentation">
            <tr><td>
              <a href="${accountSettingsUrl}" style="display:inline-block;background:#0f172a;color:#ffffff;font-size:14px;font-weight:600;text-decoration:none;padding:10px 22px;border-radius:8px">Enable 2FA now &rarr;</a>
            </td></tr>
          </table>
          <p style="margin:20px 0 0;font-size:12px;color:#9ca3af;line-height:1.5">
            If you didn&rsquo;t expect this email or have any questions, just reply to this message &mdash; we&rsquo;re happy to help.
          </p>
        </td></tr>
        <tr><td style="padding:16px 28px;border-top:1px solid #f1f5f9">
          <p style="margin:0;font-size:11px;color:#9ca3af">The Chippi team</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

  try {
    const result = await resend.emails.send({
      from: `Chippi <${FROM}>`,
      to: toEmail,
      subject: 'Secure your Chippi account \u2014 enable two-factor authentication',
      html,
    });
    if (result.error) {
      logger.error('[email] MFA prompt: Resend API error', { to: toEmail, resendError: result.error });
    } else {
      logger.info('[email] MFA prompt sent', { to: toEmail, messageId: result.data?.id });
    }
  } catch (err) {
    logger.error('[email] MFA prompt failed', { to: toEmail }, err);
  }
}

// ── Status update email (sent to applicant when status changes) ───────────────

const STATUS_LABELS: Record<string, string> = {
  received: 'Received',
  under_review: 'Under Review',
  tour_scheduled: 'Tour Scheduled',
  approved: 'Approved',
  declined: 'Declined',
  waitlisted: 'Waitlisted',
  needs_info: 'Needs Info',
};

export interface StatusUpdateEmailParams {
  toEmail: string;
  applicantName: string;
  businessName: string;
  slug: string;
  applicationRef: string;
  statusPortalToken: string | null;
  newStatus: string;
  note: string | null;
}

export async function sendStatusUpdateEmail(params: StatusUpdateEmailParams): Promise<void> {
  if (!process.env.RESEND_API_KEY) {
    logger.warn('[email] RESEND_API_KEY not set — skipping status update email');
    return;
  }
  const { Resend } = await import('resend');
  const resend = new Resend(process.env.RESEND_API_KEY);
  const FROM = getFromAddress();

  const { toEmail, applicantName, businessName, slug, applicationRef, statusPortalToken, newStatus, note } = params;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://my.usechippi.com';
  let portalUrl = `${appUrl}/apply/${encodeURIComponent(slug)}/status?ref=${encodeURIComponent(applicationRef)}`;
  if (statusPortalToken) {
    portalUrl += `&token=${encodeURIComponent(statusPortalToken)}`;
  }

  const safeBusinessName = esc(businessName);
  const safeName = esc(applicantName);
  const statusLabel = STATUS_LABELS[newStatus] ?? newStatus;
  const safeNote = note ? esc(note) : null;

  const statusColor =
    newStatus === 'approved' ? '#059669' :
    newStatus === 'declined' ? '#dc2626' :
    newStatus === 'waitlisted' ? '#d97706' :
    newStatus === 'tour_scheduled' ? '#7c3aed' :
    '#2563eb';

  // Explicit background colors for email client compatibility (no hex+alpha trick)
  const statusBgColor =
    newStatus === 'approved' ? '#ecfdf5' :
    newStatus === 'declined' ? '#fef2f2' :
    newStatus === 'waitlisted' ? '#fffbeb' :
    newStatus === 'tour_scheduled' ? '#f5f3ff' :
    '#eff6ff';

  const html = `
<!DOCTYPE html>
<html lang="en">
<body style="margin:0;padding:0;background:#f9fafb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="background:#f9fafb;padding:32px 16px">
    <tr><td align="center">
      <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="max-width:520px;background:#ffffff;border-radius:12px;border:1px solid #e5e7eb;overflow:hidden">
        <!-- Header -->
        <tr><td style="background:#0f172a;padding:20px 28px">
          <h1 style="margin:0;color:#ffffff;font-size:20px;font-weight:700">${safeBusinessName}</h1>
        </td></tr>
        <!-- Body -->
        <tr><td style="padding:24px 28px">
          <h2 style="margin:0 0 16px;font-size:18px;font-weight:700;color:#111827">Application Update</h2>
          <p style="margin:0 0 16px;font-size:14px;color:#374151;line-height:1.6">Hi ${safeName}, your application status has been updated:</p>
          <!-- Status badge -->
          <div style="text-align:center;margin:20px 0">
            <span style="display:inline-block;background:${statusBgColor};color:${statusColor};font-size:16px;font-weight:700;padding:10px 24px;border-radius:9999px">${esc(statusLabel)}</span>
          </div>
          ${safeNote ? `
          <div style="background:#f3f4f6;border-radius:8px;padding:16px;margin:16px 0">
            <p style="margin:0;font-size:12px;color:#6b7280;font-weight:600;text-transform:uppercase;letter-spacing:.04em;margin-bottom:6px">Note from ${safeBusinessName}</p>
            <p style="margin:0;font-size:14px;color:#374151;line-height:1.6">${safeNote}</p>
          </div>
          ` : ''}
          <!-- CTA -->
          <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="margin-top:24px">
            <tr><td align="center">
              <!--[if mso]>
              <v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word" href="${portalUrl}" style="height:44px;v-text-anchor:middle;width:240px;" arcsize="18%" strokecolor="#0f172a" fillcolor="#0f172a">
                <w:anchorlock/>
                <center style="color:#ffffff;font-family:sans-serif;font-size:14px;font-weight:600;">View your application &rarr;</center>
              </v:roundrect>
              <![endif]-->
              <!--[if !mso]><!-->
              <a href="${portalUrl}" style="display:inline-block;background:#0f172a;color:#ffffff;font-size:14px;font-weight:600;text-decoration:none;padding:12px 28px;border-radius:8px;min-width:200px;text-align:center">View your application &rarr;</a>
              <!--<![endif]-->
            </td></tr>
          </table>
          <p style="margin:20px 0 0;font-size:11px;color:#9ca3af;text-align:center">
            Or copy this link: <a href="${portalUrl}" style="color:#6b7280;word-break:break-all">${portalUrl}</a>
          </p>
        </td></tr>
        <!-- Footer -->
        <tr><td style="padding:16px 28px;border-top:1px solid #f1f5f9">
          <p style="margin:0;font-size:11px;color:#9ca3af">This email was sent by ${safeBusinessName} via Chippi</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

  const safeSubjectBiz = businessName.replace(/[\r\n\t]/g, ' ').slice(0, 150);

  try {
    const result = await resend.emails.send({
      from: `${businessName.replace(/[\r\n\t<>"]/g, ' ').slice(0, 100)} <${FROM}>`,
      to: toEmail,
      subject: `Application Update — ${safeSubjectBiz}`,
      html,
    });
    if (result.error) {
      logger.error('[email] status update: Resend API error', { to: toEmail, resendError: result.error });
    } else {
      logger.info('[email] status update sent', { to: toEmail, messageId: result.data?.id });
    }
  } catch (err) {
    logger.error('[email] status update failed', { to: toEmail }, err);
  }
}
