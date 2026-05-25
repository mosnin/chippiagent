/** Lightweight email sender reused by the waitlist notify endpoint. */
export async function sendEmail(to: string, subject: string, html: string) {
  if (!process.env.RESEND_API_KEY) {
    console.log(`[waitlist-email] (dev) RESEND_API_KEY not set — skipping. To: ${to} | Subject: ${subject}`);
    return;
  }

  try {
    const { Resend } = await import('resend');
    const resend = new Resend(process.env.RESEND_API_KEY);
    const rawFrom = process.env.RESEND_FROM_EMAIL ?? 'notifications@alerts.usechippi.com';
    const FROM = rawFrom.includes('@') ? rawFrom : `notifications@${rawFrom}`;
    const safeSubject = subject.replace(/[\r\n\t]/g, ' ').slice(0, 200);
    const result = await resend.emails.send({ from: FROM, to, subject: safeSubject, html });
    if (result.error) {
      console.error(`[waitlist-email] Resend API error for "${subject}" to ${to}:`, JSON.stringify(result.error));
    } else {
      console.log(`[waitlist-email] Sent "${subject}" to ${to}`, JSON.stringify(result.data));
    }
  } catch (err) {
    console.error('[waitlist-email] Send failed:', err);
  }
}
