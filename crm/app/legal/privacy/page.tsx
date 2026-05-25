export const metadata = {
  title: 'Privacy Policy | Chippi',
  description: 'Privacy Policy for Chippi, a B2B SaaS agentic OS for real estate agents and brokerages.',
};

export default function PrivacyPolicyPage() {
  return (
    <article className="space-y-10">
      <header>
        <h1 className="text-3xl font-semibold tracking-tight">Privacy Policy</h1>
        <p className="mt-2 text-sm text-muted-foreground">Last updated: April 2, 2026</p>
        <p className="text-sm text-muted-foreground">Effective: April 2, 2026</p>
      </header>

      <p className="text-sm leading-6 text-muted-foreground">
        This Privacy Policy describes how Chippi Inc. (&quot;Chippi,&quot; &quot;we,&quot; &quot;us,&quot; or &quot;our&quot;) collects, uses, and
        protects information in connection with the Chippi platform available at usechippi.com and my.usechippi.com
        (the &quot;Service&quot;). By using the Service, you agree to the practices described in this policy.
      </p>

      {/* 1. Who We Are */}
      <section>
        <h2 className="text-xl font-semibold">1. Who We Are</h2>
        <div className="mt-3 text-sm text-muted-foreground space-y-3 leading-6">
          <p>1.1. Chippi Inc. operates a B2B SaaS agentic OS for real estate agents and brokerages. The platform combines an autonomous AI agent with intake forms, AI lead scoring, deal pipelines, tour scheduling, voice AI, MCP server integration, and brokerage team management.</p>
          <p>1.2. With respect to Subscriber Data (including Applicant data), Chippi acts as a <strong className="text-foreground">Data Processor</strong>. We process data on behalf of our Subscribers (realtors and brokerages), who are the <strong className="text-foreground">Data Controllers</strong>.</p>
          <p>1.3. For data we collect directly about Subscribers for account and billing purposes, Chippi acts as the Data Controller.</p>
        </div>
      </section>

      {/* 2. Data Controller Clarification */}
      <section>
        <h2 className="text-xl font-semibold">2. Data Controller Clarification</h2>
        <div className="mt-3 text-sm text-muted-foreground space-y-3 leading-6">
          <p>2.1. Realtors and brokerages who use the Service are the Data Controllers of the data they collect through intake forms, deal pipelines, and other Service features. They are responsible for how they use their own data.</p>
          <p>2.2. Subscribers are responsible for obtaining all necessary consents from Applicants and complying with applicable data protection laws.</p>
          <p>2.3. Applicants who submit data through intake forms agree to both Chippi&apos;s Privacy Policy and the applicable Subscriber&apos;s (realtor/brokerage) privacy policy.</p>
          <p>2.4. For details on how we process data on behalf of Subscribers, please refer to our <a href="/legal/dpa" className="underline hover:text-foreground">Data Processing Agreement</a>.</p>
        </div>
      </section>

      {/* 3. Information Collected from Subscribers */}
      <section>
        <h2 className="text-xl font-semibold">3. Information Collected from Subscribers</h2>
        <div className="mt-3 text-sm text-muted-foreground space-y-3 leading-6">
          <p>3.1. <strong className="text-foreground">Account Information.</strong> When you create an account, we collect your name, email address, phone number, brokerage or company name, and login credentials (managed via Clerk).</p>
          <p>3.2. <strong className="text-foreground">Billing Information.</strong> Payment details including credit card information, billing address, and transaction history are collected and processed by Stripe. Chippi does not store full payment card numbers.</p>
          <p>3.3. <strong className="text-foreground">Usage Information.</strong> We collect data about how you interact with the Service, including pages visited, features used, session duration, device and browser information, IP address, and referral sources.</p>
          <p>3.4. <strong className="text-foreground">Team Information.</strong> If you manage a brokerage team, we collect information about team members you invite, including their names and email addresses.</p>
        </div>
      </section>

      {/* 4. Information Collected from Applicants */}
      <section>
        <h2 className="text-xl font-semibold">4. Information Collected from Applicants</h2>
        <div className="mt-3 text-sm text-muted-foreground space-y-3 leading-6">
          <p>4.1. When Applicants submit information through a Subscriber&apos;s intake forms, we collect that data <strong className="text-foreground">on behalf of the Subscriber (Data Controller)</strong>. This may include:</p>
          <ul className="list-disc pl-5 space-y-1">
            <li>Name, email address, and phone number.</li>
            <li>Housing preferences and requirements.</li>
            <li>Employment and income information (if requested by the Subscriber).</li>
            <li>Any other information the Subscriber&apos;s intake form requests.</li>
          </ul>
          <p>4.2. Applicant data is processed solely for the purpose of providing the Service to the Subscriber. The Subscriber determines what data is collected through their intake forms.</p>
          <p>4.3. Applicants with questions about how their data is used should contact the Subscriber (realtor/brokerage) who collected their information.</p>
        </div>
      </section>

      {/* 5. How We Use Information */}
      <section>
        <h2 className="text-xl font-semibold">5. How We Use Information</h2>
        <div className="mt-3 text-sm text-muted-foreground space-y-3 leading-6">
          <p>5.1. <strong className="text-foreground">Provide the Service.</strong> Operate and maintain the platform, including intake forms, deal pipelines, tour scheduling, brokerage team management, and MCP server integration.</p>
          <p>5.2. <strong className="text-foreground">AI Scoring.</strong> Process Applicant data through AI lead scoring features to provide Subscribers with advisory insights. AI scoring is performed solely to deliver the Service, not for any other purpose.</p>
          <p>5.3. <strong className="text-foreground">Notifications.</strong> Send transactional notifications such as new lead alerts, tour reminders, deal updates, and account-related communications via email (Resend) and SMS (Telnyx).</p>
          <p>5.4. <strong className="text-foreground">Analytics.</strong> Analyze aggregate usage patterns to improve the performance, reliability, and features of the Service.</p>
          <p>5.5. <strong className="text-foreground">Billing.</strong> Process subscription payments and manage billing through Stripe.</p>
          <p>5.6. <strong className="text-foreground">Security.</strong> Detect, prevent, and address fraud, abuse, and security issues.</p>
          <p>5.7. <strong className="text-foreground">Legal Compliance.</strong> Comply with applicable laws, regulations, and legal processes.</p>
        </div>
      </section>

      {/* 6. AI Data Usage */}
      <section>
        <h2 className="text-xl font-semibold">6. AI Data Usage</h2>
        <div className="mt-3 text-sm text-muted-foreground space-y-3 leading-6">
          <p>6.1. AI features (including lead scoring and voice AI assistant) process data solely to provide scoring results and advisory outputs to Subscribers.</p>
          <p>6.2. <strong className="text-foreground">We do not use Subscriber Data or Applicant data to train artificial intelligence models.</strong></p>
          <p>6.3. AI-generated scores and recommendations are <strong className="text-foreground">advisory only</strong> and do not constitute automated legal decision-making. Subscribers retain full responsibility for all decisions made using AI outputs.</p>
          <p>6.4. AI processing is performed through our integration with OpenAI. Data sent to OpenAI is subject to our data processing agreements with them and is not used by OpenAI for model training.</p>
        </div>
      </section>

      {/* 7. Third-Party Services */}
      <section>
        <h2 className="text-xl font-semibold">7. Third-Party Services</h2>
        <div className="mt-3 text-sm text-muted-foreground space-y-3 leading-6">
          <p>7.1. We use the following third-party service providers to operate the Service:</p>
          <ul className="list-disc pl-5 space-y-2">
            <li><strong className="text-foreground">Supabase</strong> &mdash; database hosting and data storage infrastructure.</li>
            <li><strong className="text-foreground">Clerk</strong> &mdash; user authentication, session management, and identity services.</li>
            <li><strong className="text-foreground">Stripe</strong> &mdash; payment processing, subscription billing, and financial transaction management.</li>
            <li><strong className="text-foreground">OpenAI</strong> &mdash; AI-powered lead scoring, voice AI assistant, and analytical features.</li>
            <li><strong className="text-foreground">Resend</strong> &mdash; transactional email delivery (lead alerts, account notifications).</li>
            <li><strong className="text-foreground">Telnyx</strong> &mdash; SMS delivery and voice communications.</li>
          </ul>
          <p>7.2. Each third-party provider processes data in accordance with their own privacy policies and our data processing agreements with them.</p>
          <p>7.3. We select providers that maintain appropriate security and privacy standards. However, we are not responsible for the independent practices of third-party services.</p>
        </div>
      </section>

      {/* 8. Data Sharing */}
      <section>
        <h2 className="text-xl font-semibold">8. Data Sharing</h2>
        <div className="mt-3 text-sm text-muted-foreground space-y-3 leading-6">
          <p>8.1. <strong className="text-foreground">We do not sell your personal data.</strong> We never have and never will sell data to third parties.</p>
          <p>8.2. We share data only with the third-party service providers listed in Section 7, and only to the extent necessary to operate the Service.</p>
          <p>8.3. We may disclose information if required by law, court order, or governmental regulation, or if we believe disclosure is necessary to protect our rights, your safety, or the safety of others.</p>
          <p>8.4. In the event of a merger, acquisition, or sale of assets, your information may be transferred to the successor entity, subject to the same privacy protections described in this policy.</p>
        </div>
      </section>

      {/* 9. Data Retention */}
      <section>
        <h2 className="text-xl font-semibold">9. Data Retention</h2>
        <div className="mt-3 text-sm text-muted-foreground space-y-3 leading-6">
          <p>9.1. <strong className="text-foreground">Active Subscriber Data.</strong> We retain Subscriber account and billing data for the duration of the active subscription.</p>
          <p>9.2. <strong className="text-foreground">Lead and Applicant Data.</strong> Applicant data is retained for up to 24 months from the date of collection, or until the Subscriber deletes it, whichever comes first.</p>
          <p>9.3. <strong className="text-foreground">Post-Cancellation.</strong> Following subscription cancellation or account termination, we retain all Subscriber Data for 30 days to allow for data export. After this period, data is permanently and irreversibly deleted.</p>
          <p>9.4. <strong className="text-foreground">Legal Obligations.</strong> We may retain certain data beyond the periods stated above if required by law or to resolve disputes.</p>
        </div>
      </section>

      {/* 10. Security Measures */}
      <section>
        <h2 className="text-xl font-semibold">10. Security Measures</h2>
        <div className="mt-3 text-sm text-muted-foreground space-y-3 leading-6">
          <p>10.1. We implement industry-standard security measures to protect your data, including:</p>
          <ul className="list-disc pl-5 space-y-1">
            <li>Encryption of data in transit (TLS/SSL) and at rest.</li>
            <li>Secure authentication through Clerk with support for multi-factor authentication.</li>
            <li>Role-based access controls for brokerage team management.</li>
            <li>Regular security assessments and monitoring.</li>
            <li>Secure infrastructure provided by our hosting partners.</li>
          </ul>
          <p>10.2. While we take reasonable precautions to protect your data, no method of transmission over the Internet or electronic storage is 100% secure. We cannot guarantee absolute security.</p>
        </div>
      </section>

      {/* 11. Your Rights */}
      <section>
        <h2 className="text-xl font-semibold">11. Your Rights</h2>
        <div className="mt-3 text-sm text-muted-foreground space-y-3 leading-6">
          <p>11.1. Depending on your jurisdiction, you may have the following rights regarding your personal data:</p>
          <ul className="list-disc pl-5 space-y-1">
            <li><strong className="text-foreground">Access.</strong> Request a copy of the personal data we hold about you.</li>
            <li><strong className="text-foreground">Correction.</strong> Request correction of inaccurate or incomplete data.</li>
            <li><strong className="text-foreground">Deletion.</strong> Request deletion of your personal data, subject to legal retention requirements.</li>
            <li><strong className="text-foreground">Portability.</strong> Request your data in a structured, commonly used, machine-readable format.</li>
            <li><strong className="text-foreground">Opt-Out.</strong> Opt out of non-essential communications at any time.</li>
          </ul>
          <p>11.2. <strong className="text-foreground">For Subscribers:</strong> You can exercise these rights by contacting us at <a href="mailto:help@usechippi.com" className="underline hover:text-foreground">help@usechippi.com</a> or through your account settings.</p>
          <p>11.3. <strong className="text-foreground">For Applicants:</strong> Because Subscribers are the Data Controllers of Applicant data, Applicants should first contact the realtor or brokerage that collected their information. If you are unable to reach the Subscriber, you may contact us at <a href="mailto:help@usechippi.com" className="underline hover:text-foreground">help@usechippi.com</a> and we will assist in forwarding your request.</p>
          <p>11.4. We will respond to data rights requests within 30 days.</p>
        </div>
      </section>

      {/* 12. Children's Privacy */}
      <section>
        <h2 className="text-xl font-semibold">12. Children&apos;s Privacy</h2>
        <div className="mt-3 text-sm text-muted-foreground space-y-3 leading-6">
          <p>12.1. The Service is not intended for individuals under the age of 18. We do not knowingly collect personal information from children under 18.</p>
          <p>12.2. If we become aware that we have collected personal data from a child under 18, we will take steps to delete that information promptly.</p>
          <p>12.3. If you believe a child under 18 has provided us with personal data, please contact us at <a href="mailto:help@usechippi.com" className="underline hover:text-foreground">help@usechippi.com</a>.</p>
        </div>
      </section>

      {/* 13. International Data Transfers */}
      <section>
        <h2 className="text-xl font-semibold">13. International Data Transfers</h2>
        <div className="mt-3 text-sm text-muted-foreground space-y-3 leading-6">
          <p>13.1. Your data may be processed and stored in the United States or other countries where our service providers operate.</p>
          <p>13.2. If you are located outside the United States, your data may be transferred to, stored, and processed in the United States. By using the Service, you consent to such transfers.</p>
          <p>13.3. We take appropriate measures to ensure that international data transfers comply with applicable data protection laws, including the use of standard contractual clauses where required.</p>
        </div>
      </section>

      {/* 14. Cookie Usage */}
      <section>
        <h2 className="text-xl font-semibold">14. Cookie Usage</h2>
        <div className="mt-3 text-sm text-muted-foreground space-y-3 leading-6">
          <p>14.1. We use cookies and similar technologies to operate and improve the Service. For detailed information, please refer to our <a href="/legal/cookies" className="underline hover:text-foreground">Cookie Policy</a>.</p>
          <p>14.2. Essential cookies are required for authentication and core functionality. You may manage non-essential cookies through your browser settings.</p>
        </div>
      </section>

      {/* 14A. Subscriber Tracking Technologies */}
      <section>
        <h2 className="text-xl font-semibold">14A. Subscriber Tracking Technologies</h2>
        <div className="mt-3 text-sm text-muted-foreground space-y-3 leading-6">
          <p>14A.1. Subscribers (realtors and brokerages) may configure third-party tracking pixels on their public-facing intake forms and tour booking pages. These tracking technologies may include pixels and scripts from platforms such as Meta/Facebook, Google Analytics, Google Ads, TikTok, Twitter/X, LinkedIn, and Snapchat.</p>
          <p>14A.2. These technologies may collect information such as IP addresses, browser type, device information, pages visited, and actions taken (such as form submissions). This data is sent directly from the Applicant&apos;s browser to the respective third-party platform.</p>
          <p>14A.3. <strong className="text-foreground">Chippi acts as a Data Processor</strong> with respect to Subscriber-configured tracking pixels. The Subscriber (Data Controller) is responsible for disclosing the use of these technologies in their own privacy policy and obtaining any required consents.</p>
          <p>14A.4. Applicants may opt out of third-party tracking by adjusting their browser settings, using browser extensions that block tracking scripts, or visiting the <a href="https://optout.aboutads.info/" className="underline hover:text-foreground" target="_blank" rel="noopener noreferrer">Digital Advertising Alliance&apos;s opt-out page</a>.</p>
        </div>
      </section>

      {/* 15. Changes to This Policy */}
      <section>
        <h2 className="text-xl font-semibold">15. Changes to This Policy</h2>
        <div className="mt-3 text-sm text-muted-foreground space-y-3 leading-6">
          <p>15.1. We may update this Privacy Policy from time to time. We will notify Subscribers of material changes by email or through the Service at least 30 days before the changes take effect.</p>
          <p>15.2. The &quot;Last updated&quot; date at the top of this policy indicates when the most recent revisions were made.</p>
          <p>15.3. Your continued use of the Service after the effective date of any changes constitutes your acceptance of the revised policy.</p>
        </div>
      </section>

      {/* 16. Contact */}
      <section>
        <h2 className="text-xl font-semibold">16. Contact</h2>
        <div className="mt-3 text-sm text-muted-foreground space-y-3 leading-6">
          <p>If you have questions about this Privacy Policy or our data practices, please contact us:</p>
          <p>
            Chippi Inc.<br />
            Email: <a href="mailto:help@usechippi.com" className="underline hover:text-foreground">help@usechippi.com</a><br />
            Website: <a href="https://usechippi.com" className="underline hover:text-foreground">usechippi.com</a>
          </p>
        </div>
      </section>
    </article>
  );
}
