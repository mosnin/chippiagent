export const metadata = {
  title: 'Data Processing Agreement | Chippi',
  description: 'Data Processing Agreement for Chippi, a B2B SaaS agentic OS for real estate agents and brokerages.',
};

export default function DataProcessingAgreementPage() {
  return (
    <article className="space-y-10">
      <header>
        <h1 className="text-3xl font-semibold tracking-tight">Data Processing Agreement</h1>
        <p className="mt-2 text-sm text-muted-foreground">Last updated: April 2, 2026</p>
        <p className="text-sm text-muted-foreground">Effective: April 2, 2026</p>
      </header>

      <p className="text-sm leading-6 text-muted-foreground">
        This Data Processing Agreement (&quot;DPA&quot;) forms part of the <a href="/legal/terms" className="underline hover:text-foreground">Terms of Service</a> between
        Chippi Inc. (&quot;Processor,&quot; &quot;Chippi,&quot; &quot;we,&quot; &quot;us,&quot; or &quot;our&quot;) and the Subscriber (&quot;Controller,&quot; &quot;you,&quot;
        or &quot;your&quot;) who has agreed to the Terms of Service for the Chippi platform available at usechippi.com
        and my.usechippi.com (the &quot;Service&quot;). This DPA sets out the terms under which Chippi processes
        personal data on behalf of the Controller.
      </p>

      {/* 1. Definitions */}
      <section>
        <h2 className="text-xl font-semibold">1. Definitions</h2>
        <div className="mt-3 text-sm text-muted-foreground space-y-3 leading-6">
          <p>1.1. In this DPA, the following terms have the meanings set out below:</p>
          <ul className="list-disc pl-5 space-y-2">
            <li><strong className="text-foreground">&quot;Controller&quot;</strong> means the Subscriber (realtor, brokerage, or other entity) that determines the purposes and means of the processing of personal data through the Service. The Controller is the Data Controller with respect to all Applicant data and Subscriber Data processed through the Service.</li>
            <li><strong className="text-foreground">&quot;Processor&quot;</strong> means Chippi Inc., which processes personal data on behalf of the Controller in connection with the provision of the Service.</li>
            <li><strong className="text-foreground">&quot;Personal Data&quot;</strong> means any information relating to an identified or identifiable natural person that is processed by the Processor on behalf of the Controller through the Service.</li>
            <li><strong className="text-foreground">&quot;Data Subject&quot;</strong> means the identified or identifiable natural person to whom Personal Data relates, including Applicants who submit data through intake forms.</li>
            <li><strong className="text-foreground">&quot;Sub-Processor&quot;</strong> means any third party engaged by the Processor to process Personal Data on behalf of the Controller.</li>
            <li><strong className="text-foreground">&quot;Data Breach&quot;</strong> means a breach of security leading to the accidental or unlawful destruction, loss, alteration, unauthorized disclosure of, or access to, Personal Data.</li>
            <li><strong className="text-foreground">&quot;Applicable Data Protection Laws&quot;</strong> means all laws and regulations applicable to the processing of Personal Data, including GDPR, CCPA, and other relevant data protection legislation.</li>
          </ul>
        </div>
      </section>

      {/* 2. Scope of Processing */}
      <section>
        <h2 className="text-xl font-semibold">2. Scope of Processing</h2>
        <div className="mt-3 text-sm text-muted-foreground space-y-3 leading-6">
          <p>2.1. The Processor shall process Personal Data only for the purpose of providing the Service to the Controller, as described in the Terms of Service.</p>
          <p>2.2. The categories of Personal Data processed include:</p>
          <ul className="list-disc pl-5 space-y-1">
            <li>Applicant contact information (name, email, phone number).</li>
            <li>Housing preferences and requirements submitted through intake forms.</li>
            <li>Employment and financial information (if collected by the Controller through intake forms).</li>
            <li>Lead scoring data and AI-generated advisory outputs.</li>
            <li>Deal pipeline information and tour scheduling data.</li>
            <li>Communications sent through the Service (email and SMS).</li>
          </ul>
          <p>2.3. The categories of Data Subjects include Applicants, prospective buyers, prospective renters, and other individuals whose data the Controller collects through the Service.</p>
          <p>2.4. Processing activities include storage, retrieval, organization, AI scoring analysis, notification delivery (email and SMS), and deletion of Personal Data as necessary to provide the Service.</p>
        </div>
      </section>

      {/* 3. Obligations of the Processor */}
      <section>
        <h2 className="text-xl font-semibold">3. Obligations of the Processor</h2>
        <div className="mt-3 text-sm text-muted-foreground space-y-3 leading-6">
          <p>3.1. The Processor shall:</p>
          <ul className="list-disc pl-5 space-y-2">
            <li>Process Personal Data only on documented instructions from the Controller, unless required to do so by applicable law.</li>
            <li>Ensure that persons authorized to process Personal Data have committed themselves to confidentiality or are under an appropriate statutory obligation of confidentiality.</li>
            <li>Implement appropriate technical and organizational security measures to protect Personal Data, including encryption in transit and at rest, access controls, and regular security assessments.</li>
            <li>Not engage a Sub-Processor without prior written authorization from the Controller (which may be given generally in this DPA for the Sub-Processors listed in Section 4).</li>
            <li>Assist the Controller in responding to Data Subject requests, including requests for access, rectification, erasure, restriction, portability, and objection.</li>
            <li>Assist the Controller in ensuring compliance with obligations regarding data breach notification, data protection impact assessments, and prior consultation with supervisory authorities.</li>
            <li>At the Controller&apos;s choice, delete or return all Personal Data to the Controller after the end of the provision of services, and delete existing copies unless storage is required by applicable law.</li>
            <li>Make available to the Controller all information necessary to demonstrate compliance with the obligations laid down in this DPA.</li>
            <li><strong className="text-foreground">Not sell Personal Data.</strong> Under no circumstances will the Processor sell Personal Data or use it for any purpose other than providing the Service.</li>
            <li><strong className="text-foreground">Not use Personal Data for AI training.</strong> Personal Data will not be used to train, improve, or develop artificial intelligence models.</li>
          </ul>
        </div>
      </section>

      {/* 4. Sub-Processors */}
      <section>
        <h2 className="text-xl font-semibold">4. Sub-Processors</h2>
        <div className="mt-3 text-sm text-muted-foreground space-y-3 leading-6">
          <p>4.1. The Controller hereby provides general written authorization for the Processor to engage the following Sub-Processors:</p>
          <div className="overflow-x-auto mt-3">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left py-2 pr-4 font-semibold text-foreground">Sub-Processor</th>
                  <th className="text-left py-2 pr-4 font-semibold text-foreground">Purpose</th>
                  <th className="text-left py-2 font-semibold text-foreground">Location</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/50">
                <tr>
                  <td className="py-2 pr-4">Supabase</td>
                  <td className="py-2 pr-4">Database hosting and data storage infrastructure</td>
                  <td className="py-2">United States</td>
                </tr>
                <tr>
                  <td className="py-2 pr-4">Clerk</td>
                  <td className="py-2 pr-4">User authentication and session management</td>
                  <td className="py-2">United States</td>
                </tr>
                <tr>
                  <td className="py-2 pr-4">Stripe</td>
                  <td className="py-2 pr-4">Payment processing and subscription billing</td>
                  <td className="py-2">United States</td>
                </tr>
                <tr>
                  <td className="py-2 pr-4">OpenAI</td>
                  <td className="py-2 pr-4">AI lead scoring and voice AI assistant features</td>
                  <td className="py-2">United States</td>
                </tr>
                <tr>
                  <td className="py-2 pr-4">Resend</td>
                  <td className="py-2 pr-4">Transactional email delivery</td>
                  <td className="py-2">United States</td>
                </tr>
                <tr>
                  <td className="py-2 pr-4">Telnyx</td>
                  <td className="py-2 pr-4">SMS delivery and voice communications</td>
                  <td className="py-2">United States</td>
                </tr>
              </tbody>
            </table>
          </div>
          <p>4.2. The Processor shall ensure that each Sub-Processor is bound by data protection obligations no less protective than those set out in this DPA.</p>
          <p>4.3. The Processor shall notify the Controller of any intended changes to Sub-Processors (additions or replacements) at least 30 days in advance, giving the Controller the opportunity to object. If the Controller objects on reasonable grounds, the parties shall discuss the concern in good faith. If no resolution is reached, the Controller may terminate the affected services.</p>
          <p>4.4. The Processor shall remain fully liable to the Controller for the performance of each Sub-Processor&apos;s obligations.</p>
        </div>
      </section>

      {/* 5. Data Subject Rights */}
      <section>
        <h2 className="text-xl font-semibold">5. Data Subject Rights</h2>
        <div className="mt-3 text-sm text-muted-foreground space-y-3 leading-6">
          <p>5.1. The Controller is primarily responsible for responding to Data Subject requests, as the Controller determines the purposes and means of processing.</p>
          <p>5.2. If the Processor receives a request from a Data Subject directly, the Processor shall promptly notify the Controller and shall not respond to the request without the Controller&apos;s authorization, unless required by applicable law.</p>
          <p>5.3. The Processor shall provide the Controller with reasonable assistance in fulfilling Data Subject requests, including:</p>
          <ul className="list-disc pl-5 space-y-1">
            <li>Providing tools within the Service for the Controller to access, export, correct, and delete Applicant data.</li>
            <li>Assisting with data portability requests by providing data in a structured, commonly used, machine-readable format.</li>
            <li>Implementing technical measures to facilitate the exercise of Data Subject rights.</li>
          </ul>
          <p>5.4. The Processor shall respond to Controller requests for assistance with Data Subject rights within a reasonable timeframe, not to exceed 15 business days.</p>
        </div>
      </section>

      {/* 6. Data Breach Notification */}
      <section>
        <h2 className="text-xl font-semibold">6. Data Breach Notification</h2>
        <div className="mt-3 text-sm text-muted-foreground space-y-3 leading-6">
          <p>6.1. The Processor shall notify the Controller of any confirmed Data Breach without undue delay and in any event within <strong className="text-foreground">72 hours</strong> of becoming aware of the breach.</p>
          <p>6.2. The notification shall include, to the extent available:</p>
          <ul className="list-disc pl-5 space-y-1">
            <li>A description of the nature of the Data Breach, including the categories and approximate number of Data Subjects and records affected.</li>
            <li>The name and contact details of the Processor&apos;s point of contact for further information.</li>
            <li>A description of the likely consequences of the Data Breach.</li>
            <li>A description of the measures taken or proposed to address the Data Breach, including measures to mitigate its possible adverse effects.</li>
          </ul>
          <p>6.3. The Processor shall cooperate with the Controller and take reasonable steps to assist in the investigation, mitigation, and remediation of the Data Breach.</p>
          <p>6.4. The Processor shall document all Data Breaches, including the facts, effects, and remedial actions taken, and make this documentation available to the Controller upon request.</p>
        </div>
      </section>

      {/* 7. Data Deletion on Termination */}
      <section>
        <h2 className="text-xl font-semibold">7. Data Deletion on Termination</h2>
        <div className="mt-3 text-sm text-muted-foreground space-y-3 leading-6">
          <p>7.1. Upon termination or expiration of the Terms of Service, the Processor shall:</p>
          <ul className="list-disc pl-5 space-y-1">
            <li>Provide the Controller with the ability to export their data for a period of 30 days following termination.</li>
            <li>After the 30-day export period, permanently and irreversibly delete all Personal Data processed on behalf of the Controller, including all copies and backups.</li>
            <li>Confirm deletion in writing upon the Controller&apos;s request.</li>
          </ul>
          <p>7.2. The Processor may retain Personal Data beyond the deletion period only to the extent required by applicable law, and shall inform the Controller of any such requirement.</p>
          <p>7.3. Any Personal Data retained for legal compliance purposes shall continue to be protected in accordance with this DPA and shall be deleted as soon as the legal requirement expires.</p>
        </div>
      </section>

      {/* 8. Audit Rights */}
      <section>
        <h2 className="text-xl font-semibold">8. Audit Rights</h2>
        <div className="mt-3 text-sm text-muted-foreground space-y-3 leading-6">
          <p>8.1. The Processor shall make available to the Controller all information necessary to demonstrate compliance with this DPA and applicable data protection laws.</p>
          <p>8.2. The Processor shall allow for and contribute to audits, including inspections, conducted by the Controller or an auditor mandated by the Controller, subject to the following conditions:</p>
          <ul className="list-disc pl-5 space-y-1">
            <li>The Controller shall provide at least 30 days&apos; written notice of any audit request.</li>
            <li>Audits shall be conducted during normal business hours and shall not unreasonably disrupt the Processor&apos;s operations.</li>
            <li>The Controller shall bear the costs of the audit, unless the audit reveals a material breach by the Processor.</li>
            <li>The auditor shall be bound by appropriate confidentiality obligations.</li>
            <li>Audits shall be limited to once per 12-month period, unless a Data Breach or regulatory investigation necessitates an additional audit.</li>
          </ul>
          <p>8.3. The Processor may satisfy audit requirements by providing the Controller with relevant third-party audit reports, certifications, or compliance documentation, where available.</p>
        </div>
      </section>

      {/* 9. International Transfers */}
      <section>
        <h2 className="text-xl font-semibold">9. International Transfers</h2>
        <div className="mt-3 text-sm text-muted-foreground space-y-3 leading-6">
          <p>9.1. The Processor shall not transfer Personal Data to a country outside the United States without ensuring that appropriate safeguards are in place, as required by applicable data protection laws.</p>
          <p>9.2. Where required, the Processor shall enter into standard contractual clauses or rely on other approved transfer mechanisms to ensure the lawfulness of international data transfers.</p>
        </div>
      </section>

      {/* 10. Liability */}
      <section>
        <h2 className="text-xl font-semibold">10. Liability</h2>
        <div className="mt-3 text-sm text-muted-foreground space-y-3 leading-6">
          <p>10.1. The liability of each party under this DPA is subject to the limitations of liability set out in the <a href="/legal/terms" className="underline hover:text-foreground">Terms of Service</a>.</p>
          <p>10.2. The Controller acknowledges that it is responsible for its own compliance with applicable data protection laws, including ensuring a lawful basis for processing and obtaining necessary consents from Data Subjects.</p>
        </div>
      </section>

      {/* 11. Term and Termination */}
      <section>
        <h2 className="text-xl font-semibold">11. Term and Termination</h2>
        <div className="mt-3 text-sm text-muted-foreground space-y-3 leading-6">
          <p>11.1. This DPA shall remain in effect for the duration of the Terms of Service and for as long as the Processor processes Personal Data on behalf of the Controller.</p>
          <p>11.2. Sections 6, 7, 8, and 10 shall survive termination of this DPA.</p>
        </div>
      </section>

      {/* 12. Contact */}
      <section>
        <h2 className="text-xl font-semibold">12. Contact</h2>
        <div className="mt-3 text-sm text-muted-foreground space-y-3 leading-6">
          <p>For questions about this Data Processing Agreement, please contact us:</p>
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
