import type { TrackingPixels as TrackingPixelsType } from '@/lib/types';

/**
 * Validate a pixel ID at render time to prevent XSS via dangerouslySetInnerHTML.
 * Returns the ID if safe, or null if it contains unexpected characters.
 * Defense-in-depth: the API already validates on save, but we also validate at render.
 */
const PIXEL_ID_SAFE = /^[a-zA-Z0-9\-_]+$/;
function safePixelId(id: string | undefined): string | null {
  if (!id) return null;
  const trimmed = id.trim();
  if (!trimmed || trimmed.length > 100) return null;
  if (!PIXEL_ID_SAFE.test(trimmed)) return null;
  return trimmed;
}

/**
 * Allowlisted domains for custom script src attributes.
 * Must match the API-side allowlist in /api/settings/tracking/route.ts.
 */
const ALLOWED_SCRIPT_DOMAINS = [
  'connect.facebook.net',
  'www.facebook.com',
  'analytics.tiktok.com',
  'www.googletagmanager.com',
  'www.google-analytics.com',
  'googleads.g.doubleclick.net',
  'static.ads-twitter.com',
  'snap.licdn.com',
  'sc-static.net',
  'www.google.com',
  'cdn.amplitude.com',
  'js.hs-scripts.com',
  'js.hs-analytics.net',
  'www.clarity.ms',
  'cdn.segment.com',
];

/**
 * Sanitize custom head script at render time (defense-in-depth).
 *
 * SECURITY: Only allow external script tags with HTTPS src from allowlisted domains.
 * Block inline scripts entirely. This prevents stored XSS even if the API validation
 * is bypassed or if existing DB records predate the API-side fix.
 */
function safeCustomScript(script: string | undefined): string | null {
  if (!script) return null;
  const trimmed = script.trim();
  if (!trimmed) return null;

  // Block dangerous patterns outright
  const dangerousPatterns = [
    /javascript\s*:/gi,
    /data\s*:/gi,
    /vbscript\s*:/gi,
    /on\w+\s*=/gi,
    /expression\s*\(/gi,
    /<iframe/gi,
    /<object/gi,
    /<embed/gi,
    /<form/gi,
    /<svg/gi,
    /document\s*\./gi,
    /window\s*\./gi,
    /eval\s*\(/gi,
  ];

  for (const pattern of dangerousPatterns) {
    if (pattern.test(trimmed)) {
      console.warn('[TrackingPixels] Blocked dangerous custom script pattern');
      return null;
    }
  }

  // Reject inline scripts: all <script> tags must have a src attribute
  const allScriptTags = trimmed.match(/<script[^>]*>/gi) ?? [];
  const scriptTagsWithSrc = trimmed.match(/<script[^>]*\bsrc\s*=/gi) ?? [];
  if (allScriptTags.length > scriptTagsWithSrc.length) {
    console.warn('[TrackingPixels] Blocked inline custom script (no src)');
    return null;
  }

  // Validate all src URLs against domain allowlist
  const scriptSrcRegex = /<script[^>]*\bsrc\s*=\s*["']([^"']+)["'][^>]*>/gi;
  let match;
  while ((match = scriptSrcRegex.exec(trimmed)) !== null) {
    try {
      const parsed = new URL(match[1]);
      if (parsed.protocol !== 'https:') return null;
      if (!ALLOWED_SCRIPT_DOMAINS.some(d => parsed.hostname === d || parsed.hostname.endsWith('.' + d))) {
        console.warn('[TrackingPixels] Blocked script from non-allowlisted domain:', parsed.hostname);
        return null;
      }
    } catch {
      return null;
    }
  }

  // Custom scripts are rendered inside a <div>, not a <script> tag,
  // so </script> closing tags are valid and needed for proper HTML structure.
  return trimmed;
}

/**
 * Server component that renders tracking pixel scripts for public-facing pages.
 * Each pixel loads asynchronously / non-blocking via `async` or deferred init patterns.
 */
export function TrackingPixels({ pixels }: { pixels: TrackingPixelsType | null }) {
  if (!pixels) return null;

  // Validate all pixel IDs at render time to prevent XSS
  const fb = safePixelId(pixels.facebookPixelId);
  const tt = safePixelId(pixels.tiktokPixelId);
  const ga = safePixelId(pixels.googleAnalyticsId);
  const gads = safePixelId(pixels.googleAdsId);
  const tw = safePixelId(pixels.twitterPixelId);
  const li = safePixelId(pixels.linkedinPartnerId);
  const snap = safePixelId(pixels.snapchatPixelId);
  const customScript = safeCustomScript(pixels.customHeadScript);

  const hasAny = fb || tt || ga || gads || tw || li || snap || customScript;

  if (!hasAny) return null;

  return (
    <>
      {/* Meta/Facebook Pixel */}
      {fb && (
        <>
          <script
            dangerouslySetInnerHTML={{
              __html: `!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');fbq('init','${fb}');fbq('track','PageView');`,
            }}
          />
          <noscript>
            <img
              height="1"
              width="1"
              style={{ display: 'none' }}
              src={`https://www.facebook.com/tr?id=${fb}&ev=PageView&noscript=1`}
              alt=""
            />
          </noscript>
        </>
      )}

      {/* TikTok Pixel */}
      {tt && (
        <script
          dangerouslySetInnerHTML={{
            __html: `!function(w,d,t){w.TiktokAnalyticsObject=t;var ttq=w[t]=w[t]||[];ttq.methods=["page","track","identify","instances","debug","on","off","once","ready","alias","group","enableCookie","disableCookie"],ttq.setAndDefer=function(t,e){t[e]=function(){t.push([e].concat(Array.prototype.slice.call(arguments,0)))}};for(var i=0;i<ttq.methods.length;i++)ttq.setAndDefer(ttq,ttq.methods[i]);ttq.instance=function(t){for(var e=ttq._i[t]||[],n=0;n<ttq.methods.length;n++)ttq.setAndDefer(e,ttq.methods[n]);return e};ttq.load=function(e,n){var i="https://analytics.tiktok.com/i18n/pixel/events.js";ttq._i=ttq._i||{},ttq._i[e]=[],ttq._i[e]._u=i,ttq._t=ttq._t||{},ttq._t[e]=+new Date,ttq._o=ttq._o||{},ttq._o[e]=n||{};var o=document.createElement("script");o.type="text/javascript",o.async=!0,o.src=i+"?sdkid="+e+"&lib="+t;var a=document.getElementsByTagName("script")[0];a.parentNode.insertBefore(o,a)};ttq.load('${tt}');ttq.page()}(window,document,'ttq');`,
          }}
        />
      )}

      {/* Google Analytics (GA4) */}
      {ga && (
        <>
          <script
            async
            src={`https://www.googletagmanager.com/gtag/js?id=${ga}`}
          />
          <script
            dangerouslySetInnerHTML={{
              __html: `window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments)}gtag('js',new Date());gtag('config','${ga}');`,
            }}
          />
        </>
      )}

      {/* Google Ads -- only render gtag loader if GA4 didn't already load it */}
      {gads && !ga && (
        <>
          <script
            async
            src={`https://www.googletagmanager.com/gtag/js?id=${gads}`}
          />
          <script
            dangerouslySetInnerHTML={{
              __html: `window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments)}gtag('js',new Date());gtag('config','${gads}');`,
            }}
          />
        </>
      )}
      {/* Google Ads config when GA4 already loaded gtag */}
      {gads && ga && (
        <script
          dangerouslySetInnerHTML={{
            __html: `gtag('config','${gads}');`,
          }}
        />
      )}

      {/* Twitter/X Pixel */}
      {tw && (
        <script
          dangerouslySetInnerHTML={{
            __html: `!function(e,t,n,s,u,a){e.twq||(s=e.twq=function(){s.exe?s.exe.apply(s,arguments):s.queue.push(arguments)},s.version='1.1',s.queue=[],u=t.createElement(n),u.async=!0,u.src='https://static.ads-twitter.com/uwt.js',a=t.getElementsByTagName(n)[0],a.parentNode.insertBefore(u,a))}(window,document,'script');twq('config','${tw}');`,
          }}
        />
      )}

      {/* LinkedIn Insight Tag */}
      {li && (
        <script
          dangerouslySetInnerHTML={{
            __html: `_linkedin_partner_id="${li}";(function(l){if(!l){window.lintrk=function(a,b){window.lintrk.q.push([a,b])};window.lintrk.q=[]}var s=document.getElementsByTagName("script")[0];var b=document.createElement("script");b.type="text/javascript";b.async=true;b.src="https://snap.licdn.com/li.lms-analytics/insight.min.js";s.parentNode.insertBefore(b,s)})(window.lintrk);`,
          }}
        />
      )}

      {/* Snapchat Pixel */}
      {snap && (
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(e,t,n){if(e.snaptr)return;var a=e.snaptr=function(){a.handleRequest?a.handleRequest.apply(a,arguments):a.queue.push(arguments)};a.queue=[];var s='script';var r=t.createElement(s);r.async=!0;r.src=n;var u=t.getElementsByTagName(s)[0];u.parentNode.insertBefore(r,u)})(window,document,'https://sc-static.net/scevent.min.js');snaptr('init','${snap}',{});snaptr('track','PAGE_VIEW');`,
          }}
        />
      )}

      {/* Custom Head Script — rendered as raw HTML since content contains <script> tags */}
      {customScript && (
        <div
          dangerouslySetInnerHTML={{
            __html: customScript,
          }}
          style={{ display: 'none' }}
        />
      )}
    </>
  );
}
