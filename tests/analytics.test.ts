/**
 * The Google tag: who gets it, what it says before it says anything else, and
 * the several ways it is not supposed to appear.
 *
 * The interesting assertions are the negative ones. A measurement id that is not
 * a measurement id must never reach a `<script>`; a bundle or the og image must
 * never be rewritten; the deployer's settings must not be measured; and a
 * deployment that set no id (every fork that clears it) must serve nothing from
 * Google Analytics whatsoever.
 */

import { describe, expect, it } from 'vitest';
import {
  CONSENT_KEY,
  CONSENT_REGIONS,
  analyticsHead,
  consentRequiredFor,
  isMeasurementId,
  isMeasuredPath,
  measurementIdFor,
  shouldInject,
  type InjectionContext,
} from '../src/worker/analytics';
import type { Env } from '../src/worker/types';

/** A made up id in the shape Google issues, deliberately not this deployment's. */
const ID = 'G-TESTID0000';
const html = (body = '<html><head><title>t</title></head><body></body></html>') =>
  new Response(body, { status: 200, headers: { 'content-type': 'text/html; charset=utf-8' } });

/** The decision, which is all of the logic. The rewrite it guards is one call to
 *  a workerd global that Node does not have; check that against the live
 *  deployment instead (`curl -s <url> | grep gtag`). */
const injects = (response: Response, context: Partial<InjectionContext> = {}): boolean =>
  shouldInject(response, { measurementId: ID, pathname: '/', method: 'GET', ...context });

describe('the measurement id', () => {
  it('accepts the shape Google issues and nothing else', () => {
    expect(isMeasurementId('G-TESTID0000')).toBe(true);
    expect(isMeasurementId('G-ABCD1234')).toBe(true);
    expect(isMeasurementId('')).toBe(false);
    expect(isMeasurementId(undefined)).toBe(false);
    expect(isMeasurementId('UA-12345-1')).toBe(false);
    expect(isMeasurementId('AW-123456')).toBe(false);
    // The reason the check exists: this value is interpolated into a script.
    expect(isMeasurementId("G-X'});</script><script>alert(1)//")).toBe(false);
    expect(isMeasurementId('G-')).toBe(false);
  });

  it('reads it off the env, trimmed, or reports that there is none', () => {
    expect(measurementIdFor({ GA_MEASUREMENT_ID: ' g-testid0000 ' })).toBe(ID);
    expect(measurementIdFor({})).toBeNull();
    expect(measurementIdFor({ GA_MEASUREMENT_ID: '' })).toBeNull();
    expect(measurementIdFor({ GA_MEASUREMENT_ID: 'nope' })).toBeNull();
    // The var is declared on Env, so this is the same call the Worker makes.
    expect(measurementIdFor({ GA_MEASUREMENT_ID: ID } as Env)).toBe(ID);
  });
});

describe('who is asked', () => {
  it('asks across the EEA, the UK and Switzerland', () => {
    for (const country of ['DE', 'FR', 'IE', 'GB', 'CH', 'NO', 'IS', 'LI']) {
      expect(consentRequiredFor(country)).toBe(true);
    }
    expect(CONSENT_REGIONS).toHaveLength(new Set(CONSENT_REGIONS).size);
  });

  it('does not ask where it does not have to', () => {
    for (const country of ['US', 'CN', 'SG', 'JP', 'KR', 'TW', 'AU']) {
      expect(consentRequiredFor(country)).toBe(false);
    }
    expect(consentRequiredFor('us')).toBe(false);
  });

  it('asks when it cannot tell', () => {
    // No request.cf: local dev, a test, an odd proxy.
    expect(consentRequiredFor(undefined)).toBe(true);
    expect(consentRequiredFor(null)).toBe(true);
    expect(consentRequiredFor('')).toBe(true);
    expect(consentRequiredFor(42)).toBe(true);
  });

  it('leaves the settings path unmeasured, and only that', () => {
    expect(isMeasuredPath('/')).toBe(true);
    expect(isMeasuredPath('/privacy')).toBe(true);
    expect(isMeasuredPath('/settings')).toBe(false);
    expect(isMeasuredPath('/settings/')).toBe(false);
    expect(isMeasuredPath('/settingsx')).toBe(true);
  });
});

describe('the tag itself', () => {
  const head = analyticsHead(ID);

  it('denies everything in the consent regions, and says so before it loads', () => {
    const defaults = head.indexOf("gtag('consent','default'");
    const library = head.indexOf('googletagmanager.com/gtag/js');
    const config = head.indexOf("gtag('config'");
    expect(defaults).toBeGreaterThan(-1);
    // Consent is declared before the first hit, and before the library is even asked for.
    expect(defaults).toBeLessThan(config);
    expect(config).toBeLessThan(library);
    expect(head).toContain("'ad_storage':'denied'");
    expect(head).toContain("'ad_user_data':'denied'");
    expect(head).toContain("'ad_personalization':'denied'");
    expect(head).toContain("'analytics_storage':'denied'");
    for (const country of CONSENT_REGIONS) expect(head).toContain(`'${country}'`);
  });

  it('grants elsewhere, in a second default with no region', () => {
    const granted = head.slice(head.indexOf("'region'"));
    expect(granted).toContain("'ad_storage':'granted'");
  });

  it('replays a stored answer ahead of the first hit', () => {
    expect(CONSENT_KEY).toBe('wenyiqian.consent');
    expect(head).toContain(`localStorage.getItem('${CONSENT_KEY}')`);
    expect(head.indexOf(CONSENT_KEY)).toBeLessThan(head.indexOf("gtag('config'"));
  });

  it('carries the id in both places, and nothing else', () => {
    expect(head).toContain(`gtag('config','${ID}')`);
    expect(head).toContain(`gtag/js?id=${ID}`);
  });
});

describe('the inline script, run', () => {
  const head = analyticsHead(ID);
  const script = head.slice(head.indexOf('<script>') + '<script>'.length, head.indexOf('</script>'));
  const OFF = `ga-disable-${ID}`;

  /** Runs the inline block against a stand-in page and returns what it left behind. */
  const run = (hash: string, stored: string | null = null) => {
    const dataLayer: IArguments[] = [];
    const page = { window: { dataLayer } as Record<string, unknown>, location: { hash } };
    const listeners: Record<string, () => void> = {};
    const storage = { getItem: (key: string) => (key === CONSENT_KEY ? stored : null) };
    new Function('window', 'location', 'addEventListener', 'localStorage', 'dataLayer', script)(
      page.window,
      page.location,
      (type: string, listener: () => void) => void (listeners[type] = listener),
      storage,
      dataLayer,
    );
    const calls = () => dataLayer.map((args) => Array.from(args));
    return { ...page, listeners, calls };
  };

  it('ends on config, so the first page view goes out after consent is settled', () => {
    const { calls, window } = run('');
    expect(calls().at(-1)).toEqual(['config', ID]);
    expect(calls().filter(([command]) => command === 'consent').length).toBe(2);
    expect(window[OFF]).toBeUndefined();
  });

  it('replays a stored answer before config, and ignores anything else in the key', () => {
    for (const answer of ['granted', 'denied'] as const) {
      const calls = run('', answer).calls();
      const update = calls.findIndex(([command, kind]) => command === 'consent' && kind === 'update');
      expect(update).toBeGreaterThan(-1);
      expect(update).toBeLessThan(calls.findIndex(([command]) => command === 'config'));
      expect(calls[update][2]).toMatchObject({ analytics_storage: answer, ad_storage: answer });
    }
    expect(run('', 'maybe').calls().some(([, kind]) => kind === 'update')).toBe(false);
  });

  it('switches itself off when the page opens on #settings', () => {
    expect(run('#settings').window[OFF]).toBe(true);
    expect(run('#/settings').window[OFF]).toBe(true);
    expect(run('#history').window[OFF]).toBeUndefined();
    expect(run('#privacy').window[OFF]).toBeUndefined();
  });

  it('switches itself off the moment the hash turns into #settings, and stays off', () => {
    const page = run('');
    page.location.hash = '#settings';
    page.listeners.popstate();
    expect(page.window[OFF]).toBe(true);
    page.location.hash = '';
    page.listeners.hashchange();
    expect(page.window[OFF]).toBe(true);
  });

});

describe('injection', () => {
  it('tags an HTML page', () => {
    expect(injects(html())).toBe(true);
    expect(injects(html(), { pathname: '/privacy' })).toBe(true);
    expect(injects(html(), { method: 'HEAD' })).toBe(true);
  });

  it('serves nothing at all when no id is configured', () => {
    expect(injects(html(), { measurementId: null })).toBe(false);
  });

  it('leaves everything that is not an HTML page exactly as it was', () => {
    expect(injects(new Response('binary', { status: 200, headers: { 'content-type': 'image/jpeg' } }))).toBe(false);
    expect(
      injects(new Response('{"a":1}', { status: 200, headers: { 'content-type': 'application/json' } })),
    ).toBe(false);
    expect(injects(new Response('asset', { status: 200 }))).toBe(false);
  });

  it('leaves a 404 alone', () => {
    expect(
      injects(new Response('<html><head></head></html>', { status: 404, headers: { 'content-type': 'text/html' } })),
    ).toBe(false);
  });

  it('does not measure the settings page', () => {
    expect(injects(html(), { pathname: '/settings' })).toBe(false);
  });

  it('does not rewrite a mutation', () => {
    expect(injects(html(), { method: 'POST' })).toBe(false);
  });
});
