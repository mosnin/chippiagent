export const metadata = {
  title: 'Acceptable Use Policy | Chippi',
  description: 'Acceptable Use Policy for Chippi, a B2B SaaS agentic OS for real estate agents and brokerages.',
};

export default function AcceptableUsePolicyPage() {
  return (
    <article className="space-y-10">
      <header>
        <h1 className="text-3xl font-semibold tracking-tight">Acceptable Use Policy</h1>
        <p className="mt-2 text-sm text-muted-foreground">Last updated: April 2, 2026</p>
        <p className="text-sm text-muted-foreground">Effective: April 2, 2026</p>
      </header>

      <p className="text-sm leading-6 text-muted-foreground">
        This Acceptable Use Policy (&quot;AUP&quot;) governs the use of the Chippi platform available at usechippi.com and
        my.usechippi.com (the &quot;Service&quot;) operated by Chippi Inc. (&quot;Chippi,&quot; &quot;we,&quot; &quot;us,&quot; or &quot;our&quot;). This AUP is
        incorporated into and forms part of our <a href="/legal/terms" className="underline hover:text-foreground">Terms of Service</a>.
        All Users of the Service must comply with this policy.
      </p>

      {/* 1. Prohibited Activities */}
      <section>
        <h2 className="text-xl font-semibold">1. Prohibited Activities</h2>
        <div className="mt-3 text-sm text-muted-foreground space-y-3 leading-6">
          <p>1.1. You may not use the Service to engage in any of the following activities:</p>
          <ul className="list-disc pl-5 space-y-2">
            <li><strong className="text-foreground">Spam and Unsolicited Communications.</strong> Sending unsolicited bulk messages, marketing communications, or other spam through the Service, including via email (Resend) or SMS (Telnyx) integrations. All communications sent through the Service must comply with applicable laws, including the CAN-SPAM Act, TCPA, and equivalent regulations.</li>
            <li><strong className="text-foreground">Discrimination.</strong> Using the Service to discriminate against any individual or group based on race, color, religion, sex, national origin, familial status, disability, sexual orientation, gender identity, age, or any other characteristic protected by applicable law.</li>
            <li><strong className="text-foreground">Scraping and Data Harvesting.</strong> Using automated tools, bots, crawlers, or scrapers to extract data from the Service or from other Users&apos; accounts without authorization.</li>
            <li><strong className="text-foreground">Impersonation.</strong> Misrepresenting your identity, impersonating another person or entity, or falsely implying an affiliation with Chippi or any third party.</li>
            <li><strong className="text-foreground">Malicious Activity.</strong> Uploading or transmitting viruses, malware, or other harmful code. Attempting to gain unauthorized access to the Service, other accounts, or connected systems.</li>
            <li><strong className="text-foreground">Illegal Activity.</strong> Using the Service for any purpose that violates applicable local, state, national, or international law or regulation.</li>
            <li><strong className="text-foreground">Abuse of AI Features.</strong> Manipulating AI scoring inputs to produce false or misleading results, or using AI outputs as the sole basis for legal, financial, or housing decisions without human review.</li>
            <li><strong className="text-foreground">Interference.</strong> Disrupting, overloading, or impairing the Service or its infrastructure, including through denial-of-service attacks or excessive API usage.</li>
            <li><strong className="text-foreground">Unauthorized Resale.</strong> Reselling, sublicensing, or redistributing access to the Service without Chippi&apos;s prior written consent.</li>
          </ul>
        </div>
      </section>

      {/* 2. Fair Housing Compliance */}
      <section>
        <h2 className="text-xl font-semibold">2. Fair Housing Compliance</h2>
        <div className="mt-3 text-sm text-muted-foreground space-y-3 leading-6">
          <p>2.1. Subscribers who are licensed real estate professionals must comply with all applicable fair housing laws, including but not limited to the Fair Housing Act (42 U.S.C. 3601 et seq.) and state and local fair housing statutes.</p>
          <p>2.2. The Service must not be used to:</p>
          <ul className="list-disc pl-5 space-y-1">
            <li>Refuse to sell, rent, or negotiate housing based on protected characteristics.</li>
            <li>Discriminate in the terms, conditions, or privileges of a real estate transaction.</li>
            <li>Make, print, or publish any statement indicating a preference, limitation, or discrimination based on a protected class.</li>
            <li>Steer prospective buyers or renters toward or away from particular neighborhoods based on protected characteristics.</li>
          </ul>
          <p>2.3. AI lead scoring is provided as an advisory tool only and must not be used as the sole basis for any housing decision. Subscribers are solely responsible for ensuring that their use of AI features complies with fair housing requirements.</p>
        </div>
      </section>

      {/* 3. Data Protection Obligations */}
      <section>
        <h2 className="text-xl font-semibold">3. Data Protection Obligations for Subscribers</h2>
        <div className="mt-3 text-sm text-muted-foreground space-y-3 leading-6">
          <p>3.1. As Data Controllers, Subscribers are responsible for:</p>
          <ul className="list-disc pl-5 space-y-1">
            <li>Obtaining all necessary consents from Applicants before collecting their data through intake forms.</li>
            <li>Providing Applicants with clear privacy notices that explain how their data will be used.</li>
            <li>Ensuring that their collection and use of data complies with applicable data protection laws, including GDPR, CCPA, and other relevant regulations.</li>
            <li>Responding to data subject access requests from their Applicants in a timely manner.</li>
            <li>Maintaining their own privacy policy that Applicants can access.</li>
          </ul>
          <p>3.2. Subscribers must not collect sensitive personal data through the Service unless it is necessary for the real estate transaction and they have obtained explicit consent from the data subject.</p>
          <p>3.3. Subscribers must implement reasonable security practices within their own organizations to protect the data they access through the Service.</p>
        </div>
      </section>

      {/* 4. Content Standards */}
      <section>
        <h2 className="text-xl font-semibold">4. Content Standards</h2>
        <div className="mt-3 text-sm text-muted-foreground space-y-3 leading-6">
          <p>4.1. All Content uploaded, submitted, or shared through the Service must:</p>
          <ul className="list-disc pl-5 space-y-1">
            <li>Be accurate and not misleading.</li>
            <li>Comply with applicable laws and regulations.</li>
            <li>Not infringe upon the intellectual property rights of any third party.</li>
            <li>Not contain defamatory, obscene, harassing, or threatening material.</li>
            <li>Not contain malicious code or links to harmful websites.</li>
          </ul>
          <p>4.2. Subscribers are solely responsible for the Content they create, upload, or share through the Service, including intake form configurations, deal notes, and communications sent to Applicants.</p>
        </div>
      </section>

      {/* 5. Enforcement and Consequences */}
      <section>
        <h2 className="text-xl font-semibold">5. Enforcement and Consequences</h2>
        <div className="mt-3 text-sm text-muted-foreground space-y-3 leading-6">
          <p>5.1. Chippi reserves the right to investigate any suspected violation of this AUP and to take appropriate action, which may include:</p>
          <ul className="list-disc pl-5 space-y-1">
            <li>Issuing a warning to the violating User.</li>
            <li>Temporarily suspending access to the Service.</li>
            <li>Permanently terminating the User&apos;s account.</li>
            <li>Removing or disabling access to Content that violates this AUP.</li>
            <li>Reporting violations to appropriate law enforcement authorities.</li>
          </ul>
          <p>5.2. We may take enforcement action at our sole discretion and without prior notice if we reasonably believe a violation has occurred or is likely to occur.</p>
          <p>5.3. Account termination for AUP violations does not entitle the User to a refund of any subscription fees.</p>
          <p>5.4. We reserve the right to cooperate with law enforcement agencies and comply with valid legal processes regarding suspected illegal activity conducted through the Service.</p>
        </div>
      </section>

      {/* 6. Reporting Violations */}
      <section>
        <h2 className="text-xl font-semibold">6. Reporting Violations</h2>
        <div className="mt-3 text-sm text-muted-foreground space-y-3 leading-6">
          <p>6.1. If you become aware of any violation of this Acceptable Use Policy, please report it to us immediately.</p>
          <p>6.2. Reports should include as much detail as possible, including the nature of the violation, the account or User involved, and any supporting evidence.</p>
          <p>6.3. To report a violation, contact us:</p>
          <p>
            Chippi Inc.<br />
            Email: <a href="mailto:help@usechippi.com" className="underline hover:text-foreground">help@usechippi.com</a><br />
            Website: <a href="https://usechippi.com" className="underline hover:text-foreground">usechippi.com</a>
          </p>
        </div>
      </section>

      {/* 7. Changes to This Policy */}
      <section>
        <h2 className="text-xl font-semibold">7. Changes to This Policy</h2>
        <div className="mt-3 text-sm text-muted-foreground space-y-3 leading-6">
          <p>7.1. We may update this Acceptable Use Policy from time to time. Material changes will be communicated through the Service or by email at least 30 days before they take effect.</p>
          <p>7.2. Your continued use of the Service after the effective date of any changes constitutes your acceptance of the revised policy.</p>
        </div>
      </section>
    </article>
  );
}
