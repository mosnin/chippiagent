/** Escape user-provided values for safe embedding in HTML. */
function escHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Generates a comprehensive privacy policy HTML template for realtors and brokerages.
 * Designed to protect both the entity and Chippi (the platform) from liability.
 */
export function generatePrivacyPolicy(
  entityName: string,
  entityType: 'realtor' | 'brokerage'
): string {
  const entity = escHtml(entityName || (entityType === 'brokerage' ? 'Our Brokerage' : 'Our Office'));
  const entityLabel = entityType === 'brokerage' ? 'brokerage' : 'real estate professional';
  const today = new Date().toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  return `
<h2>Privacy Policy</h2>
<p><strong>${entity}</strong></p>
<p><em>Last updated: ${today}</em></p>

<h3>1. Introduction</h3>
<p>${entity} ("we," "us," or "our") is committed to protecting the privacy and security of your personal information. This Privacy Policy describes how we collect, use, disclose, and safeguard your information when you interact with us, including through our online intake forms, websites, and communication channels.</p>
<p>We are the <strong>data controller</strong> responsible for the personal data we collect from you. We use Chippi (my.usechippi.com), a third-party customer relationship management platform, to process data on our behalf. Chippi acts solely as a <strong>data processor</strong> and does not independently control or make decisions about your personal information.</p>

<h3>2. Information We Collect</h3>
<p>We may collect the following categories of personal information:</p>
<ul>
  <li><strong>Contact Information:</strong> Name, email address, phone number, mailing address</li>
  <li><strong>Financial Information:</strong> Budget, income, employment status, credit information (if voluntarily provided)</li>
  <li><strong>Housing Preferences:</strong> Desired property type, location, move-in timeline, bedroom/bathroom requirements</li>
  <li><strong>Rental/Application Data:</strong> Current living situation, rental history, landlord references, background check consent</li>
  <li><strong>Identification Information:</strong> Date of birth, emergency contacts, co-applicant details</li>
  <li><strong>Communication Records:</strong> Emails, text messages, notes from phone calls or meetings</li>
  <li><strong>Technical Data:</strong> IP address and timestamp at the time of form submission (for consent verification)</li>
</ul>

<h3>3. How We Use Your Information</h3>
<p>We use the personal information we collect for the following purposes:</p>
<ul>
  <li><strong>Lead Management:</strong> To evaluate and respond to your inquiry, match you with suitable properties, and manage our client pipeline</li>
  <li><strong>Communication:</strong> To contact you via email, SMS, or phone regarding properties, tours, applications, and follow-ups</li>
  <li><strong>AI-Assisted Scoring:</strong> We may use artificial intelligence to analyze submitted information and assign lead qualification scores. These scores help us prioritize outreach but do not constitute automated decision-making with legal effects</li>
  <li><strong>Tour Scheduling:</strong> To book and manage property tours and appointments</li>
  <li><strong>Application Processing:</strong> To evaluate rental or purchase applications you submit through our platform</li>
  <li><strong>Service Improvement:</strong> To improve our processes and the quality of service we provide</li>
</ul>

<h3>4. Third-Party Services</h3>
<p>We use the following third-party service providers who may process your data:</p>
<ul>
  <li><strong>Chippi (my.usechippi.com):</strong> Our CRM platform that stores and processes your data on our behalf as a data processor. Chippi does not sell, share, or independently use your personal data</li>
  <li><strong>Stripe:</strong> For processing payments and billing (if applicable). Stripe's privacy policy governs payment data</li>
  <li><strong>AI Services:</strong> Artificial intelligence providers used for lead scoring and analysis. Data sent to AI services is used solely for generating scores and insights, and is not used to train AI models</li>
  <li><strong>Email and SMS Providers:</strong> Third-party services used to deliver communications you have consented to receive</li>
  <li><strong>Calendar Services:</strong> For scheduling and managing tour appointments</li>
  <li><strong>Advertising and Analytics Platforms:</strong> Third-party tracking technologies from platforms such as Meta/Facebook, Google, TikTok, Twitter/X, LinkedIn, and Snapchat may be used on our intake forms to measure advertising effectiveness</li>
</ul>
<p>We require all third-party processors to handle your data in accordance with applicable privacy laws and only for the purposes we specify.</p>

<h3>5. Tracking Technologies and Analytics</h3>
<p>We may use tracking technologies including cookies and pixels from third-party platforms (Meta/Facebook, Google, TikTok, Twitter/X, LinkedIn, Snapchat) to measure the effectiveness of advertising campaigns and understand how visitors interact with our forms.</p>
<p>These technologies may collect information such as your IP address, browser type, device information, pages visited, and actions taken (such as form submissions). This data helps us improve our marketing efforts and provide a better experience.</p>
<p>You can opt out of tracking by adjusting your browser settings, using browser extensions that block tracking scripts, or using tools like the <a href="https://optout.aboutads.info/" target="_blank" rel="noopener noreferrer">Digital Advertising Alliance's opt-out page</a>. Please note that opting out may not prevent all data collection, and some features may not function as intended without these technologies.</p>

<h3>6. Data Sharing</h3>
<p>We do not sell your personal information. We may share your data only in the following circumstances:</p>
<ul>
  <li>With service providers who assist us in operating our business (as described above)</li>
  <li>With property owners or landlords in connection with rental or purchase applications you submit</li>
  <li>When required by law, regulation, or legal process</li>
  <li>To protect our rights, safety, or property, or that of others</li>
  <li>With your explicit consent</li>
</ul>

<h3>7. Data Retention</h3>
<p>We retain your personal information for as long as necessary to fulfill the purposes described in this policy, or as required by applicable law. Specifically:</p>
<ul>
  <li><strong>Active client data:</strong> Retained for the duration of our business relationship and for a reasonable period thereafter</li>
  <li><strong>Lead and inquiry data:</strong> Retained for up to 24 months from your last interaction with us, unless you request earlier deletion</li>
  <li><strong>Application data:</strong> Retained in accordance with applicable real estate and fair housing record-keeping requirements</li>
  <li><strong>Consent records:</strong> Retained for as long as needed to demonstrate compliance with applicable laws</li>
</ul>

<h3>8. Your Rights</h3>
<p>Depending on your jurisdiction, you may have the following rights regarding your personal data:</p>
<ul>
  <li><strong>Access:</strong> You may request a copy of the personal information we hold about you</li>
  <li><strong>Correction:</strong> You may request that we correct inaccurate or incomplete data</li>
  <li><strong>Deletion:</strong> You may request that we delete your personal information, subject to legal retention requirements</li>
  <li><strong>Opt-Out:</strong> You may opt out of receiving marketing communications at any time by contacting us or using the unsubscribe mechanism in our emails</li>
  <li><strong>Data Portability:</strong> Where applicable, you may request your data in a structured, commonly used format</li>
  <li><strong>Withdraw Consent:</strong> Where processing is based on consent, you may withdraw it at any time without affecting the lawfulness of prior processing</li>
</ul>
<p>To exercise any of these rights, please contact us using the information provided below.</p>

<h3>9. Data Security</h3>
<p>We implement appropriate technical and organizational measures to protect your personal information against unauthorized access, alteration, disclosure, or destruction. However, no method of electronic storage or transmission is 100% secure, and we cannot guarantee absolute security.</p>

<h3>10. Children's Privacy</h3>
<p>Our services are not directed to individuals under the age of 18. We do not knowingly collect personal information from children. If you believe we have collected data from a minor, please contact us immediately.</p>

<h3>11. Changes to This Policy</h3>
<p>We may update this Privacy Policy from time to time. We will notify you of material changes by posting the updated policy with a revised "Last updated" date. Your continued interaction with us after such changes constitutes acceptance of the updated policy.</p>

<h3>12. Platform Disclaimer</h3>
<p>Chippi (my.usechippi.com) is a software platform that provides tools for real estate professionals to manage their client relationships. <strong>Chippi is not responsible for the privacy practices of individual ${entityLabel}s or brokerages that use its platform.</strong> This privacy policy is maintained by ${entity}, and all inquiries about data handling should be directed to ${entity}, not to Chippi. Chippi processes data solely as instructed by ${entity} and bears no independent liability for the data collection or use practices described herein.</p>

<h3>13. Contact Information</h3>
<p>If you have questions about this Privacy Policy or wish to exercise your rights, please contact us:</p>
<p><strong>${entity}</strong><br/>
Email: [YOUR EMAIL ADDRESS]<br/>
Phone: [YOUR PHONE NUMBER]<br/>
Address: [YOUR BUSINESS ADDRESS]</p>
`.trim();
}
