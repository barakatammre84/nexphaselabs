import { describe, expect, it } from 'vitest';
import {
  gateNonProduction,
  gateRequirement,
  isNonProduction,
  withNoindex,
} from '@/lib/environment-gate';

/**
 * 16.3: on 12 September 2026 the staging storefront was reachable by anyone with
 * the URL, serving a lot record with a fabricated manufacturer, real prices and a
 * working checkout. The gate existed; it failed open when the password was unset,
 * which is the state it was deployed in. These tests pin the closed behaviour.
 */

const request = (path = '/', headers: Record<string, string> = {}) =>
  new Request(`https://nexphaselabs-staging.ammre.workers.dev${path}`, { headers });

const basic = (password: string) => ({
  authorization: `Basic ${btoa(`tester:${password}`)}`,
});

describe('non-production access gate', () => {
  it('gates every deployed environment that is not production', () => {
    expect(gateRequirement('production')).toBe('open');
    expect(gateRequirement('staging')).toBe('password');
    expect(gateRequirement('preview')).toBe('password');
    // a mis-cased or unrecognised value is not production and is not local
    expect(gateRequirement('Production')).toBe('password');
    expect(gateRequirement('prod')).toBe('password');
  });

  it('never gates a local environment, including an unset APP_ENV', () => {
    for (const value of ['development', 'test', 'local', undefined, '', '  ']) {
      expect(gateRequirement(value)).toBe('local');
      expect(gateNonProduction(request(), value, undefined)).toBeNull();
    }
  });

  it('lets production through untouched', () => {
    expect(isNonProduction('production')).toBe(false);
    expect(gateNonProduction(request(), 'production', undefined)).toBeNull();
  });

  it('refuses staging outright when the password is not set', async () => {
    const response = gateNonProduction(request('/catalog'), 'staging', undefined);
    expect(response?.status).toBe(503);
    expect(await response!.text()).toContain('STAGING_ACCESS_PASSWORD');
    expect(response!.headers.get('X-Robots-Tag')).toBe('noindex, nofollow');
    expect(response!.headers.get('Cache-Control')).toBe('no-store');
  });

  it('challenges an anonymous request when the password is set', () => {
    const response = gateNonProduction(request('/catalog'), 'staging', 'correct horse');
    expect(response?.status).toBe(401);
    expect(response!.headers.get('WWW-Authenticate')).toContain('Basic realm');
    expect(response!.headers.get('X-Robots-Tag')).toBe('noindex, nofollow');
  });

  it('admits the right password and refuses every wrong one', () => {
    const password = 'correct horse';
    expect(gateNonProduction(request('/', basic(password)), 'staging', password)).toBeNull();
    for (const wrong of ['correct hors', 'correct horses', '', 'CORRECT HORSE']) {
      expect(gateNonProduction(request('/', basic(wrong)), 'staging', password)?.status).toBe(401);
    }
    // malformed or foreign authorization headers challenge rather than throw
    for (const header of ['Basic !!!not-base64!!!', 'Bearer token', 'Basic']) {
      expect(
        gateNonProduction(request('/', { authorization: header }), 'staging', password)?.status,
      ).toBe(401);
    }
  });

  it('keeps the health check and provider webhooks reachable', () => {
    for (const path of [
      '/api/health',
      '/api/webhooks/shippo?token=x',
      '/api/payments/btcpay/webhook',
    ]) {
      expect(gateNonProduction(request(path), 'staging', undefined)).toBeNull();
      expect(gateNonProduction(request(path), 'staging', 'correct horse')).toBeNull();
    }
  });

  it('opens the environment only on a stated choice, never by default', () => {
    expect(gateNonProduction(request('/catalog'), 'staging', undefined, 'true')).toBeNull();
    for (const value of ['false', 'TRUE', 'yes', '1', '', undefined]) {
      expect(gateNonProduction(request('/catalog'), 'staging', undefined, value)?.status).toBe(503);
    }
  });

  it('marks every non-production response noindex without disturbing production', () => {
    const page = () => new Response('<html></html>', { headers: { 'Content-Type': 'text/html' } });
    expect(withNoindex(page(), 'staging').headers.get('X-Robots-Tag')).toBe('noindex, nofollow');
    expect(withNoindex(page(), 'development').headers.get('X-Robots-Tag')).toBe('noindex, nofollow');
    expect(withNoindex(page(), undefined).headers.get('X-Robots-Tag')).toBe('noindex, nofollow');
    expect(withNoindex(page(), 'production').headers.get('X-Robots-Tag')).toBeNull();
  });

  it('preserves the response it is wrapping', async () => {
    const original = new Response('body text', {
      status: 201,
      headers: { 'Content-Type': 'text/plain', 'X-Custom': 'kept' },
    });
    const wrapped = withNoindex(original, 'staging');
    expect(wrapped.status).toBe(201);
    expect(wrapped.headers.get('X-Custom')).toBe('kept');
    expect(await wrapped.text()).toBe('body text');
  });

  it('does not overwrite a stricter X-Robots-Tag the page already set', () => {
    const strict = new Response('', { headers: { 'X-Robots-Tag': 'none' } });
    expect(withNoindex(strict, 'staging').headers.get('X-Robots-Tag')).toBe('none');
  });
});
