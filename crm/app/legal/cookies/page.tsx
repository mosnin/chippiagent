export const metadata = {
  title: 'Cookie Policy | Chippi',
  description: 'Cookie Policy for Chippi, a B2B SaaS agentic OS for real estate agents and brokerages.',
};

export default function CookiePolicyPage() {
  return (
    <article className="space-y-10">
      <header>
        <h1 className="text-3xl font-semibold tracking-tight">Cookie Policy</h1>
        <p className="mt-2 text-sm text-muted-foreground">Last updated: April 2, 2026</p>
        <p className="text-sm text-muted-foreground">Effective: April 2, 2026</p>
      </header>

      <p className="text-sm leading-6 text-muted-foreground">
        This Cookie Policy explains how Chippi Inc. (&quot;Chippi,&quot; &quot;we,&quot; &quot;us,&quot; or &quot;our&quot;) uses cookies and similar
        technologies on the Chippi platform available at usechippi.com and my.usechippi.com (the &quot;Service&quot;).
      </p>

      {/* 1. What Are Cookies */}
      <section>
        <h2 className="text-xl font-semibold">1. What Are Cookies</h2>
        <div className="mt-3 text-sm text-muted-foreground space-y-3 leading-6">
          <p>1.1. Cookies are small text files placed on your device (computer, tablet, or mobile phone) when you visit a website. They are widely used to make websites work more efficiently and to provide information to the owners of the website.</p>
          <p>1.2. Cookies may be &quot;session&quot; cookies (which expire when you close your browser) or &quot;persistent&quot; cookies (which remain on your device for a set period or until you delete them).</p>
          <p>1.3. We also use similar technologies such as local storage and pixel tags, which function in comparable ways. References to &quot;cookies&quot; in this policy include these similar technologies.</p>
        </div>
      </section>

      {/* 2. Essential Cookies */}
      <section>
        <h2 className="text-xl font-semibold">2. Essential Cookies</h2>
        <div className="mt-3 text-sm text-muted-foreground space-y-3 leading-6">
          <p>2.1. Essential cookies are required for the Service to function properly. They cannot be disabled without impairing core functionality.</p>
          <p>2.2. We use essential cookies for:</p>
          <ul className="list-disc pl-5 space-y-1">
            <li><strong className="text-foreground">Authentication Sessions.</strong> Managed by Clerk, these cookies maintain your login state and secure your session across the application.</li>
            <li><strong className="text-foreground">Security.</strong> Cookies that help detect and prevent fraudulent activity and protect against unauthorized access.</li>
            <li><strong className="text-foreground">Load Balancing.</strong> Cookies that ensure requests are distributed properly across our infrastructure.</li>
          </ul>
        </div>
      </section>

      {/* 3. Functional Cookies */}
      <section>
        <h2 className="text-xl font-semibold">3. Functional Cookies</h2>
        <div className="mt-3 text-sm text-muted-foreground space-y-3 leading-6">
          <p>3.1. Functional cookies enable the Service to remember your preferences and provide enhanced, personalized features.</p>
          <p>3.2. We use functional cookies for:</p>
          <ul className="list-disc pl-5 space-y-1">
            <li><strong className="text-foreground">User Preferences.</strong> Remembering your display settings, dashboard layout, and notification preferences.</li>
            <li><strong className="text-foreground">Theme.</strong> Storing your light/dark mode preference.</li>
            <li><strong className="text-foreground">Language and Locale.</strong> Remembering your preferred language and regional settings.</li>
          </ul>
          <p>3.3. If you disable functional cookies, some features of the Service may not work as intended.</p>
        </div>
      </section>

      {/* 4. Analytics Cookies */}
      <section>
        <h2 className="text-xl font-semibold">4. Analytics Cookies</h2>
        <div className="mt-3 text-sm text-muted-foreground space-y-3 leading-6">
          <p>4.1. Analytics cookies help us understand how Users interact with the Service so we can improve performance and user experience.</p>
          <p>4.2. We use analytics cookies to:</p>
          <ul className="list-disc pl-5 space-y-1">
            <li>Track page views and navigation patterns within the application.</li>
            <li>Understand which features are most and least used.</li>
            <li>Identify performance issues and errors.</li>
            <li>Measure the effectiveness of product improvements.</li>
          </ul>
          <p>4.3. Analytics data is collected in aggregate form and does not identify individual users for marketing purposes.</p>
        </div>
      </section>

      {/* 5. Third-Party Cookies */}
      <section>
        <h2 className="text-xl font-semibold">5. Third-Party Cookies</h2>
        <div className="mt-3 text-sm text-muted-foreground space-y-3 leading-6">
          <p>5.1. Some cookies are placed by third-party services that we integrate with. These include:</p>
          <ul className="list-disc pl-5 space-y-2">
            <li><strong className="text-foreground">Clerk.</strong> Sets cookies for user authentication, session management, and security tokens. These are essential cookies required for login functionality.</li>
            <li><strong className="text-foreground">Stripe.</strong> Sets cookies for payment processing, fraud prevention, and billing session management. These cookies are set when you interact with payment forms or manage your subscription.</li>
          </ul>
          <p>5.2. Third-party cookies are governed by the respective third party&apos;s cookie and privacy policies. We do not control the cookies set by third parties.</p>
          <p>5.3. We do not use advertising or marketing cookies. We do not serve ads on the Service.</p>
        </div>
      </section>

      {/* 6. Managing Cookies */}
      <section>
        <h2 className="text-xl font-semibold">6. Managing Cookies</h2>
        <div className="mt-3 text-sm text-muted-foreground space-y-3 leading-6">
          <p>6.1. You can manage or delete cookies through your browser settings. Most browsers allow you to:</p>
          <ul className="list-disc pl-5 space-y-1">
            <li>View what cookies are stored on your device.</li>
            <li>Delete all or specific cookies.</li>
            <li>Block cookies from being set in the future.</li>
            <li>Set your browser to notify you when a cookie is being set.</li>
          </ul>
          <p>6.2. Please note that disabling essential cookies will prevent you from logging in and using the Service. Disabling functional cookies may degrade your experience.</p>
          <p>6.3. For instructions on managing cookies in specific browsers, please visit your browser&apos;s help documentation.</p>
        </div>
      </section>

      {/* 7. Changes to This Policy */}
      <section>
        <h2 className="text-xl font-semibold">7. Changes to This Policy</h2>
        <div className="mt-3 text-sm text-muted-foreground space-y-3 leading-6">
          <p>7.1. We may update this Cookie Policy from time to time. The &quot;Last updated&quot; date at the top of this page indicates when the most recent changes were made.</p>
          <p>7.2. We will notify Users of material changes through the Service or by email.</p>
        </div>
      </section>

      {/* 8. Contact */}
      <section>
        <h2 className="text-xl font-semibold">8. Contact</h2>
        <div className="mt-3 text-sm text-muted-foreground space-y-3 leading-6">
          <p>If you have questions about this Cookie Policy, please contact us:</p>
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
