import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { localD1 } from './helpers/local-d1';

const { env } = vi.hoisted(() => ({ env: {} as Record<string, unknown> }));
const outbound = vi.fn();
vi.mock('cloudflare:workers', () => ({ env }));
vi.mock('next/headers', () => ({
  cookies: async () => ({ get: () => undefined }),
}));
vi.mock('next/navigation', () => ({ redirect: vi.fn() }));
vi.mock('@/lib/release', () => ({ releaseCommit: () => 'synthetic-release' }));

import { POST } from '@/app/api/staging/refund-rehearsal/route';

let local: ReturnType<typeof localD1>;

beforeEach(() => {
  local = localD1();
  Object.assign(env, { APP_ENV: 'staging', DB: local.binding });
  vi.stubGlobal('fetch', outbound);
});

afterEach(() => {
  expect(outbound).not.toHaveBeenCalled();
  vi.unstubAllGlobals();
  local.sqlite.close();
  for (const key of Object.keys(env)) delete env[key];
});

function rehearsalRequest(headers: Record<string, string> = {}) {
  return new Request('https://staging.example.invalid/api/staging/refund-rehearsal', {
    method: 'POST',
    headers: {
      host: 'staging.example.invalid',
      origin: 'https://staging.example.invalid',
      ...headers,
    },
  });
}

describe('staging refund rehearsal endpoint', () => {
  it('rejects a missing or stale release header', async () => {
    expect((await POST(rehearsalRequest())).status).toBe(404);
    expect(
      (await POST(rehearsalRequest({ 'x-staging-refund-rehearsal-release': 'old' }))).status,
    ).toBe(404);
  });

  it('runs the synthetic matrix without a provider or leftover fixture', async () => {
    const response = await POST(
      rehearsalRequest({ 'x-staging-refund-rehearsal-release': 'synthetic-release' }),
    );
    const report = await response.json() as {
      ok: boolean;
      paymentProviderContacted: boolean;
      moneySent: boolean;
      checks: { ok: boolean }[];
      totals: { buyerTotalCents: number; staffRefundTotalCents: number };
    };

    expect(response.status).toBe(200);
    expect(report.ok).toBe(true);
    expect(report.paymentProviderContacted).toBe(false);
    expect(report.moneySent).toBe(false);
    expect(report.checks.every((check) => check.ok)).toBe(true);
    expect(report.totals).toMatchObject({
      buyerTotalCents: 900,
      staffRefundTotalCents: 900,
    });
    expect(local.sqlite.prepare("SELECT count(*) AS n FROM orders WHERE id LIKE 'staging_refund_%'").get()).toEqual({ n: 0 });
  });

  it('is unavailable outside staging', async () => {
    env.APP_ENV = 'production';
    expect(
      (await POST(rehearsalRequest({ 'x-staging-refund-rehearsal-release': 'synthetic-release' }))).status,
    ).toBe(404);
  });
});