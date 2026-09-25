/**
 * Google Analytics 4, injected into the page instead of built into it.
 *
 * The tag is written into `<head>` by the Worker rather than committed to
 * index.html, for the same reason the D1 id is a binding rather than a constant:
 * a measurement id belongs to one deployment. This is a public template, and a
 * fork that quietly reported to somebody else's property would be a bug nobody
 * could see. Unset `GA_MEASUREMENT_ID` and not one byte of Google Analytics is
 * served.
 *
 * Three things this file is careful about.
 *
 * **Consent comes before the tag, not after it.** The consent defaults are
 * pushed onto dataLayer in an inline script that runs before gtag.js has even
 * been fetched, because a default that arrives after the first hit is not a
 * default. In the EEA, the UK and Switzerland everything starts `denied`;
 * everywhere else it starts `granted`. That split is Google's own `region`
 * parameter rather than anything this Worker decides, so the HTML is identical
 * for every visitor and the consent state never depends on a geo lookup being
 * right. What the Worker *does* decide is whether to show the consent line, and
 * that rides on /api/state (consentRequiredFor): a wrong guess there shows or
 * hides a line of text, it does not leak a cookie.
 *
 * **The deployer's settings are not measured.** `/settings` is a real path and
 * never gets the tag; `#settings` never reaches the server, so the inline script
 * switches the tag off in the page itself (Google's documented `ga-disable-<id>`
 * flag) before the first hit, and again the moment the hash turns into it.
 *
 * **The id is validated before it is interpolated.** It comes from a var an
 * operator sets, which is not a stranger, but it lands inside a `<script>` and
 * the rule for that position is the same either way: match the documented shape
 * or be dropped.
 */

/**
 * Where a visitor has to opt in before anything is stored: the EEA (EU 27 plus
 * Iceland, Liechtenstein and Norway), the UK, and Switzerland. The same list
 * Google publishes for Consent Mode, and the same one Tarot uses.
 */
export const CONSENT_REGIONS = [
  'AT', 'BE', 'BG', 'HR', 'CY', 'CZ', 'DK', 'EE', 'FI', 'FR',
  'DE', 'GR', 'HU', 'IE', 'IT', 'LV', 'LT', 'LU', 'MT', 'NL',
  'PL', 'PT', 'RO', 'SK', 'SI', 'ES', 'SE',
  'IS', 'LI', 'NO',
  'GB', 'CH',
] as const;

/** GA4 measurement ids look like `G-XXXXXXXXXX`, and nothing else goes in. */
const MEASUREMENT_ID = /^G-[A-Z0-9]{4,24}$/;

export const isMeasurementId = (value: string | undefined | null): value is string =>
  typeof value === 'string' && MEASUREMENT_ID.test(value.trim().toUpperCase());

/** The id this deployment measures with, or null if it measures nothing. */
export const measurementIdFor = (env: { GA_MEASUREMENT_ID?: string }): string | null => {
  const raw = env.GA_MEASUREMENT_ID?.trim().toUpperCase();
  return isMeasurementId(raw) ? raw : null;
};

/**
 * Whether this visitor is owed the consent line before anything is stored.
 *
 * Unknown country means yes. `request.cf` is absent in tests and on a local
 * `npm run dev` (and typed as unknown there), and the safe way to be wrong is
 * to ask someone who did not need asking.
 */
export const consentRequiredFor = (country: unknown): boolean => {
  if (typeof country !== 'string' || !country.trim()) return true;
  return (CONSENT_REGIONS as readonly string[]).includes(country.trim().toUpperCase());
};

/** The settings page is the deployer's own room. It is not measured. */
export const isMeasuredPath = (pathname: string): boolean => !/^\/settings(\/|$)/.test(pathname);

/** Where the visitor's own choice is kept. Read by the tag before its first hit,
 *  written by the consent line and the privacy page (src/app/analytics.ts). */
export const CONSENT_KEY = 'wenyiqian.consent';

const GRANTED = "{'ad_storage':'granted','ad_user_data':'granted','ad_personalization':'granted','analytics_storage':'granted'}";
const DENIED = "{'ad_storage':'denied','ad_user_data':'denied','ad_personalization':'denied','analytics_storage':'denied'}";

/**
 * The two script tags that go into `<head>`, in this order:
 *
 *   1. an inline block: the settings switch, consent defaults, then the
 *      visitor's stored choice if they have one, then `config`;
 *   2. gtag.js itself, async.
 *
 * The inline block runs first and synchronously, so by the time the library
 * loads, dataLayer already says what it is allowed to do.
 */
export function analyticsHead(measurementId: string): string {
  const id = measurementId.toUpperCase();
  const regions = CONSENT_REGIONS.map((code) => `'${code}'`).join(',');

  const inline = [
    "window.dataLayer=window.dataLayer||[];",
    "function gtag(){dataLayer.push(arguments);}",
    // Registered before gtag.js exists, so these run ahead of its own history
    // listener and a page view for #settings is never sent. Once off, off for
    // the life of the page: the deployer's tab is not a visit.
    `(function(){var off=function(){if(/^#\\/?settings/.test(location.hash))window['ga-disable-${id}']=true;};off();addEventListener('popstate',off);addEventListener('hashchange',off);})();`,
    // Ask first in the regions that require asking. Google resolves the more
    // specific region entry over the catch-all below, whatever the order.
    `gtag('consent','default',{'ad_storage':'denied','ad_user_data':'denied','ad_personalization':'denied','analytics_storage':'denied','functionality_storage':'granted','security_storage':'granted','wait_for_update':500,'region':[${regions}]});`,
    "gtag('consent','default',{'ad_storage':'granted','ad_user_data':'granted','ad_personalization':'granted','analytics_storage':'granted','functionality_storage':'granted','security_storage':'granted'});",
    // A choice already made outranks both defaults, and has to be replayed
    // before `config` fires the first page_view: otherwise a visitor who
    // accepted last week is measured cookielessly until they click again.
    `try{var c=localStorage.getItem('${CONSENT_KEY}');if(c==='granted')gtag('consent','update',${GRANTED});else if(c==='denied')gtag('consent','update',${DENIED});}catch(e){}`,
    "gtag('js',new Date());",
    `gtag('config','${id}');`,
  ].join('\n');

  return (
    `\n<!-- Google tag (gtag.js), injected by the Worker: see src/worker/analytics.ts -->\n` +
    `<script>\n${inline}\n</script>\n` +
    `<script async src="https://www.googletagmanager.com/gtag/js?id=${id}"></script>\n`
  );
}

export interface InjectionContext {
  measurementId: string | null;
  /** The path as the app sees it: BASE_PATH already taken off. */
  pathname: string;
  method: string;
}

/**
 * Whether this particular response is a page that gets a tag.
 *
 * Split out from the rewrite below so it can be tested in Node: HTMLRewriter is
 * a workerd global and does not exist under vitest, but every decision worth
 * getting right is in here rather than in it. Everything that is not a 200 HTML
 * document (a bundle, the og image, a redirect, a 404) is left exactly as the
 * assets binding produced it.
 */
export function shouldInject(response: Response, context: InjectionContext): boolean {
  const { measurementId, pathname, method } = context;
  if (!measurementId) return false;
  if (method !== 'GET' && method !== 'HEAD') return false;
  if (response.status !== 200) return false;
  if (!isMeasuredPath(pathname)) return false;
  return (response.headers.get('content-type') ?? '').toLowerCase().includes('text/html');
}

/** Puts the tag in the page, if there is a tag and this is a page. */
export function withAnalytics(response: Response, context: InjectionContext): Response {
  if (!shouldInject(response, context)) return response;
  return new HTMLRewriter()
    .on('head', {
      element(element) {
        element.append(analyticsHead(context.measurementId as string), { html: true });
      },
    })
    .transform(response);
}
