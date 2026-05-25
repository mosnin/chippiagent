export const metadata = {
  title: 'Terms of Service | Chippi',
  description: 'Terms of Service for Chippi, a B2B SaaS agentic OS for real estate agents and brokerages.',
};

export default function TermsPage() {
  return (
    <article className="space-y-10">
      <header>
        <h1 className="text-3xl font-semibold tracking-tight">Terms of Service</h1>
        <p className="mt-2 text-sm text-muted-foreground">Last updated: April 2, 2026</p>
        <p className="text-sm text-muted-foreground">Effective: April 2, 2026</p>
      </header>

      <p className="text-sm leading-6 text-muted-foreground">
        Welcome to Chippi. These Terms of Service (&quot;Terms&quot;) constitute a legally binding agreement between you and
        Chippi Inc. (&quot;Chippi,&quot; &quot;we,&quot; &quot;us,&quot; or &quot;our&quot;) governing your access to and use of the Chippi platform
        available at usechippi.com and my.usechippi.com (the &quot;Service&quot;). By accessing or using the Service, you agree
        to be bound by these Terms. If you do not agree, do not use the Service.
      </p>

      {/* 1. Definitions */}
      <section>
        <h2 className="text-xl font-semibold">1. Definitions</h2>
        <ul className="mt-3 list-disc pl-5 text-sm text-muted-foreground space-y-2 leading-6">
          <li><strong className="text-foreground">&quot;Service&quot;</strong> means the Chippi platform, including the web application at my.usechippi.com, all related APIs, integrations, AI features (including lead scoring, voice AI assistant, and MCP server integration), deal pipelines, tour scheduling, and documentation.</li>
          <li><strong className="text-foreground">&quot;User&quot;</strong> means any individual or entity that accesses or uses the Service, including Subscribers and Applicants.</li>
          <li><strong className="text-foreground">&quot;Subscriber&quot;</strong> means a realtor, brokerage, or other entity that creates an account and subscribes to the Service to manage real estate operations, including intake forms, lead management, deal pipelines, and brokerage team management.</li>
          <li><strong className="text-foreground">&quot;Applicant&quot;</strong> means any individual who submits information through a Subscriber&apos;s intake forms or interacts with the Service on behalf of or at the direction of a Subscriber.</li>
          <li><strong className="text-foreground">&quot;Content&quot;</strong> means all data, text, files, images, and other materials uploaded, submitted, or generated through the Service.</li>
          <li><strong className="text-foreground">&quot;Subscriber Data&quot;</strong> means all Content that a Subscriber or their Applicants submit, upload, or generate through the Service, including lead information, deal data, tour schedules, and AI scoring results.</li>
        </ul>
      </section>

      {/* 2. Account Registration and Responsibility */}
      <section>
        <h2 className="text-xl font-semibold">2. Account Registration and Responsibility</h2>
        <div className="mt-3 text-sm text-muted-foreground space-y-3 leading-6">
          <p>2.1. To use the Service as a Subscriber, you must create an account by providing accurate and complete information. You must be at least 18 years of age.</p>
          <p>2.2. You are solely responsible for maintaining the confidentiality of your account credentials and for all activities that occur under your account.</p>
          <p>2.3. You agree to notify us immediately at <a href="mailto:help@usechippi.com" className="underline hover:text-foreground">help@usechippi.com</a> if you become aware of any unauthorized use of your account.</p>
          <p>2.4. If you register on behalf of a brokerage or organization, you represent that you have authority to bind that entity to these Terms.</p>
          <p>2.5. You are responsible for all team members and agents you invite to your brokerage account. Their use of the Service is governed by these Terms, and you remain responsible for their compliance.</p>
        </div>
      </section>

      {/* 3. Subscription Terms */}
      <section>
        <h2 className="text-xl font-semibold">3. Subscription Terms</h2>
        <div className="mt-3 text-sm text-muted-foreground space-y-3 leading-6">
          <p>3.1. <strong className="text-foreground">Free Trial.</strong> New Subscribers are eligible for a 7-day free trial. During the trial period, you will have access to the full features of the Service, including AI lead scoring, deal pipelines, tour scheduling, voice AI assistant, and MCP server integration. No payment is required during the trial.</p>
          <p>3.2. <strong className="text-foreground">Paid Subscription.</strong> Following the trial period, continued access to the Service requires a paid subscription at $97 per month (or such other pricing as may be displayed at the time of purchase).</p>
          <p>3.3. <strong className="text-foreground">Auto-Renewal.</strong> Subscriptions automatically renew on a monthly basis. You will be charged at the beginning of each billing cycle unless you cancel before the renewal date.</p>
          <p>3.4. <strong className="text-foreground">Cancellation.</strong> You may cancel your subscription at any time through your account settings. Cancellation takes effect at the end of the current billing period. No refunds are provided for partial billing periods.</p>
          <p>3.5. <strong className="text-foreground">Payment Processing.</strong> All payments are processed by Stripe. By subscribing, you agree to Stripe&apos;s terms of service. Chippi does not store your full payment card details.</p>
          <p>3.6. <strong className="text-foreground">Price Changes.</strong> We may change subscription pricing with at least 30 days&apos; advance notice. Continued use of the Service after a price change constitutes acceptance of the new pricing.</p>
        </div>
      </section>

      {/* 4. Acceptable Use */}
      <section>
        <h2 className="text-xl font-semibold">4. Acceptable Use</h2>
        <div className="mt-3 text-sm text-muted-foreground space-y-3 leading-6">
          <p>4.1. You agree to use the Service only for lawful purposes and in compliance with all applicable laws and regulations. Your use is further governed by our <a href="/legal/acceptable-use" className="underline hover:text-foreground">Acceptable Use Policy</a>.</p>
          <p>4.2. You shall not:</p>
          <ul className="list-disc pl-5 space-y-1">
            <li>Send unsolicited communications or spam through the Service, including via SMS (Telnyx) or email (Resend) integrations.</li>
            <li>Use the Service in any manner that violates fair housing laws, the Fair Housing Act, or any anti-discrimination statutes.</li>
            <li>Attempt to gain unauthorized access to any part of the Service or its underlying infrastructure.</li>
            <li>Interfere with or disrupt the integrity or performance of the Service.</li>
            <li>Use the Service to collect, store, or process data in violation of any applicable privacy or data protection laws.</li>
            <li>Reverse engineer, decompile, or disassemble any part of the Service.</li>
            <li>Use AI scoring outputs to make automated legal decisions regarding Applicants without human review.</li>
          </ul>
          <p>4.3. <strong className="text-foreground">Fair Housing Compliance.</strong> Subscribers who are licensed real estate professionals must comply with all applicable fair housing laws. The Service must not be used to discriminate against any person based on race, color, religion, sex, national origin, familial status, disability, or any other protected class.</p>
        </div>
      </section>

      {/* 5. Data Controller / Processor Relationship */}
      <section>
        <h2 className="text-xl font-semibold">5. Data Controller and Processor Relationship</h2>
        <div className="mt-3 text-sm text-muted-foreground space-y-3 leading-6">
          <p>5.1. With respect to Subscriber Data (including Applicant data collected through intake forms), the Subscriber is the <strong className="text-foreground">Data Controller</strong> and Chippi is the <strong className="text-foreground">Data Processor</strong>. Realtors and brokerages are responsible for how they use their own data.</p>
          <p>5.2. Chippi processes Subscriber Data solely on the Subscriber&apos;s behalf and in accordance with the Subscriber&apos;s instructions as set forth in these Terms and our <a href="/legal/dpa" className="underline hover:text-foreground">Data Processing Agreement</a>.</p>
          <p>5.3. Subscribers are responsible for ensuring that their collection and use of data through the Service complies with all applicable data protection laws, including obtaining any necessary consents from Applicants.</p>
          <p>5.4. Applicants who submit data through intake forms agree to both Chippi&apos;s <a href="/legal/privacy" className="underline hover:text-foreground">Privacy Policy</a> and the applicable Subscriber&apos;s (realtor/brokerage) privacy policy.</p>
          <p>5.5. Chippi does not sell Subscriber Data or Applicant data. Chippi does not use Subscriber Data or Applicant data to train artificial intelligence models.</p>
        </div>
      </section>

      {/* 6. Intellectual Property */}
      <section>
        <h2 className="text-xl font-semibold">6. Intellectual Property</h2>
        <div className="mt-3 text-sm text-muted-foreground space-y-3 leading-6">
          <p>6.1. The Service, including all software, design, text, graphics, interfaces, and underlying technology, is the exclusive property of Chippi Inc. and is protected by intellectual property laws.</p>
          <p>6.2. We grant you a limited, non-exclusive, non-transferable, revocable license to access and use the Service in accordance with these Terms.</p>
          <p>6.3. Chippi, the Chippi logo, and all related names, logos, and slogans are trademarks of Chippi Inc. You may not use them without our prior written consent.</p>
        </div>
      </section>

      {/* 7. User-Generated Content and Data Ownership */}
      <section>
        <h2 className="text-xl font-semibold">7. User-Generated Content and Data Ownership</h2>
        <div className="mt-3 text-sm text-muted-foreground space-y-3 leading-6">
          <p>7.1. Subscribers retain ownership of all Subscriber Data they upload or generate through the Service.</p>
          <p>7.2. By using the Service, you grant Chippi a limited license to process, store, and transmit your Content solely as necessary to provide, maintain, and improve the Service.</p>
          <p>7.3. We do not claim ownership over your data. We do not sell your data. We do not use your data to train artificial intelligence models.</p>
          <p>7.4. Upon termination and following the data retention period described in Section 13, all Subscriber Data will be permanently deleted.</p>
        </div>
      </section>

      {/* 8. Third-Party Integrations */}
      <section>
        <h2 className="text-xl font-semibold">8. Third-Party Integrations</h2>
        <div className="mt-3 text-sm text-muted-foreground space-y-3 leading-6">
          <p>8.1. The Service integrates with the following third-party services:</p>
          <ul className="list-disc pl-5 space-y-1">
            <li><strong className="text-foreground">Stripe</strong> &mdash; payment processing and subscription billing.</li>
            <li><strong className="text-foreground">OpenAI</strong> &mdash; AI-powered lead scoring and voice AI assistant features.</li>
            <li><strong className="text-foreground">Clerk</strong> &mdash; authentication and user session management.</li>
            <li><strong className="text-foreground">Supabase</strong> &mdash; data hosting and database infrastructure.</li>
            <li><strong className="text-foreground">Resend</strong> &mdash; transactional email delivery.</li>
            <li><strong className="text-foreground">Telnyx</strong> &mdash; SMS delivery and voice communications.</li>
          </ul>
          <p>8.2. Your use of these third-party services is subject to their respective terms of service and privacy policies.</p>
          <p>8.3. Chippi is not responsible for the practices or availability of third-party services.</p>
        </div>
      </section>

      {/* 9. AI Features Disclaimer */}
      <section>
        <h2 className="text-xl font-semibold">9. AI Features Disclaimer</h2>
        <div className="mt-3 text-sm text-muted-foreground space-y-3 leading-6">
          <p>9.1. The Service includes AI-powered features such as lead scoring, voice AI assistance, MCP server integration, and other analytical tools. These features are provided for <strong className="text-foreground">informational and advisory purposes only</strong>.</p>
          <p>9.2. AI-generated scores, recommendations, and outputs <strong className="text-foreground">do not constitute automated legal decision-making</strong>. They are tools to assist Subscribers in their professional judgment and do not replace human decision-making. No legal, housing, or financial decisions should be made solely on the basis of AI outputs.</p>
          <p>9.3. Chippi does not guarantee the accuracy, completeness, or reliability of any AI-generated output. Subscribers are solely responsible for any decisions they make based on AI features.</p>
          <p>9.4. Applicant data processed by AI features is used solely for the purpose of providing the Service to the Subscriber. It is <strong className="text-foreground">not used to train AI models</strong>.</p>
        </div>
      </section>

      {/* 10. Limitation of Liability */}
      <section>
        <h2 className="text-xl font-semibold">10. Limitation of Liability</h2>
        <div className="mt-3 text-sm text-muted-foreground space-y-3 leading-6">
          <p>10.1. TO THE MAXIMUM EXTENT PERMITTED BY LAW, THE SERVICE IS PROVIDED &quot;AS IS&quot; AND &quot;AS AVAILABLE&quot; WITHOUT WARRANTIES OF ANY KIND, WHETHER EXPRESS, IMPLIED, STATUTORY, OR OTHERWISE, INCLUDING BUT NOT LIMITED TO IMPLIED WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, AND NON-INFRINGEMENT.</p>
          <p>10.2. CHIPPI SHALL NOT BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES, INCLUDING BUT NOT LIMITED TO LOSS OF PROFITS, DATA, BUSINESS OPPORTUNITIES, OR GOODWILL, ARISING OUT OF OR IN CONNECTION WITH YOUR USE OF THE SERVICE.</p>
          <p>10.3. IN NO EVENT SHALL CHIPPI&apos;S TOTAL AGGREGATE LIABILITY EXCEED THE AMOUNT YOU HAVE PAID TO CHIPPI IN THE TWELVE (12) MONTHS IMMEDIATELY PRECEDING THE EVENT GIVING RISE TO THE CLAIM.</p>
          <p>10.4. SOME JURISDICTIONS DO NOT ALLOW THE EXCLUSION OR LIMITATION OF CERTAIN WARRANTIES OR DAMAGES. IN SUCH JURISDICTIONS, OUR LIABILITY SHALL BE LIMITED TO THE GREATEST EXTENT PERMITTED BY LAW.</p>
        </div>
      </section>

      {/* 11. Indemnification */}
      <section>
        <h2 className="text-xl font-semibold">11. Indemnification</h2>
        <div className="mt-3 text-sm text-muted-foreground space-y-3 leading-6">
          <p>11.1. You agree to indemnify, defend, and hold harmless Chippi Inc., its officers, directors, employees, and agents from and against any claims, damages, losses, liabilities, costs, and expenses (including reasonable attorneys&apos; fees) arising out of or related to:</p>
          <ul className="list-disc pl-5 space-y-1">
            <li>Your use of the Service or violation of these Terms.</li>
            <li>Your collection, processing, or use of Applicant data or other personal data through the Service.</li>
            <li>Your violation of any applicable law, regulation, or third-party right, including fair housing laws and data protection regulations.</li>
            <li>Any dispute between you and an Applicant or other third party.</li>
            <li>Your use of AI scoring outputs or other AI features in making business or housing decisions.</li>
          </ul>
          <p>11.2. Subscribers, as Data Controllers, are solely responsible for their data practices and indemnify Chippi for any claims arising from the Subscriber&apos;s handling of personal data.</p>
        </div>
      </section>

      {/* 12. Dispute Resolution */}
      <section>
        <h2 className="text-xl font-semibold">12. Dispute Resolution</h2>
        <div className="mt-3 text-sm text-muted-foreground space-y-3 leading-6">
          <p>12.1. <strong className="text-foreground">Informal Resolution.</strong> Before initiating any formal dispute resolution, you agree to contact us at <a href="mailto:help@usechippi.com" className="underline hover:text-foreground">help@usechippi.com</a> to attempt to resolve the dispute informally for a period of at least thirty (30) days.</p>
          <p>12.2. <strong className="text-foreground">Binding Arbitration.</strong> If a dispute cannot be resolved informally, it shall be resolved through binding arbitration conducted in accordance with the rules of the American Arbitration Association. The arbitration shall be conducted in English.</p>
          <p>12.3. <strong className="text-foreground">Class Action Waiver.</strong> You agree that any dispute resolution proceedings will be conducted only on an individual basis and not in a class, consolidated, or representative action.</p>
          <p>12.4. <strong className="text-foreground">Exceptions.</strong> Either party may seek injunctive or equitable relief in a court of competent jurisdiction to protect intellectual property rights or prevent irreparable harm.</p>
        </div>
      </section>

      {/* 13. Termination */}
      <section>
        <h2 className="text-xl font-semibold">13. Termination</h2>
        <div className="mt-3 text-sm text-muted-foreground space-y-3 leading-6">
          <p>13.1. You may terminate your account at any time by canceling your subscription and deleting your account through your account settings.</p>
          <p>13.2. We may suspend or terminate your access to the Service immediately, without prior notice, if you violate these Terms, the <a href="/legal/acceptable-use" className="underline hover:text-foreground">Acceptable Use Policy</a>, engage in fraudulent or illegal activity, or if required by law.</p>
          <p>13.3. Upon termination, your right to use the Service ceases immediately. We will retain your data for 30 days following termination to allow for data export, after which it will be permanently deleted in accordance with our <a href="/legal/privacy" className="underline hover:text-foreground">Privacy Policy</a> and <a href="/legal/dpa" className="underline hover:text-foreground">Data Processing Agreement</a>.</p>
          <p>13.4. Sections 6, 7, 10, 11, 12, and 15 shall survive termination of these Terms.</p>
        </div>
      </section>

      {/* 14. Changes to Terms */}
      <section>
        <h2 className="text-xl font-semibold">14. Changes to Terms</h2>
        <div className="mt-3 text-sm text-muted-foreground space-y-3 leading-6">
          <p>14.1. We reserve the right to modify these Terms at any time. We will provide notice of material changes by email or through the Service at least 30 days before the changes take effect.</p>
          <p>14.2. Your continued use of the Service following the effective date of revised Terms constitutes your acceptance of the changes.</p>
          <p>14.3. If you do not agree with the revised Terms, you must stop using the Service and cancel your subscription before the changes take effect.</p>
        </div>
      </section>

      {/* 15. Governing Law */}
      <section>
        <h2 className="text-xl font-semibold">15. Governing Law</h2>
        <div className="mt-3 text-sm text-muted-foreground space-y-3 leading-6">
          <p>15.1. These Terms shall be governed by and construed in accordance with the laws of the State of Delaware, United States, without regard to its conflict of laws provisions.</p>
          <p>15.2. Any legal action or proceeding not subject to arbitration under Section 12 shall be brought exclusively in the federal or state courts located in the State of Delaware.</p>
        </div>
      </section>

      {/* 16. General Provisions */}
      <section>
        <h2 className="text-xl font-semibold">16. General Provisions</h2>
        <div className="mt-3 text-sm text-muted-foreground space-y-3 leading-6">
          <p>16.1. <strong className="text-foreground">Entire Agreement.</strong> These Terms, together with our <a href="/legal/privacy" className="underline hover:text-foreground">Privacy Policy</a>, <a href="/legal/cookies" className="underline hover:text-foreground">Cookie Policy</a>, <a href="/legal/acceptable-use" className="underline hover:text-foreground">Acceptable Use Policy</a>, and <a href="/legal/dpa" className="underline hover:text-foreground">Data Processing Agreement</a>, constitute the entire agreement between you and Chippi.</p>
          <p>16.2. <strong className="text-foreground">Severability.</strong> If any provision of these Terms is held to be invalid or unenforceable, the remaining provisions shall continue in full force and effect.</p>
          <p>16.3. <strong className="text-foreground">Waiver.</strong> Our failure to enforce any right or provision of these Terms shall not be deemed a waiver of such right or provision.</p>
          <p>16.4. <strong className="text-foreground">Assignment.</strong> You may not assign or transfer your rights under these Terms without our prior written consent. We may assign our rights and obligations without restriction.</p>
        </div>
      </section>

      {/* 17. Contact */}
      <section>
        <h2 className="text-xl font-semibold">17. Contact</h2>
        <div className="mt-3 text-sm text-muted-foreground space-y-3 leading-6">
          <p>If you have questions about these Terms of Service, please contact us:</p>
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
