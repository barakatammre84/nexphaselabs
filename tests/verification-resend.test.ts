import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { localD1 } from './helpers/local-d1';

const { env } = vi.hoisted(() => ({ env: {} as Record<string, unknown> }));
vi.mock('cloudflare:workers', () => ({ env }));
vi.mock('next/headers', () => ({ cookies: vi.fn(), headers: vi.fn() }));
vi.mock('next/navigation', () => ({ redirect: vi.fn() }));

import { getDb } from '@/db';
import { accounts } from '@/db/schema';
import { POST } from '@/app/api/account/verify/resend/route';

const ORIGIN = 'https://example.invalid';
let local: ReturnType<typeof localD1>;

function resend(email: string, ip = '198.51.100.9') {
  const body = new FormData();
  body.set('email', email);
  return POST(
    new Request(`${ORIGIN}/api/account/verify/resend`, {
      method: 'POST',
      headers: { Origin: ORIGIN, Host: new URL(ORIGIN).host, 'CF-Connecting-IP': ip },
      body,
    }),
  );
}
const count = (where = '') =>
  (local.sqlite.prepare(`SELECT count(*) AS n FROM email_tokens ${where}`).get() as { n: number }).n;
const landing = (response: Response) => new URL(response.headers.get('location')!);

beforeEach(async () => {
  local = localD1();
  Object.assign(env, { DB: local.binding, APP_ENV: 'development' });
  // Development logs the message instead of sending it; keep the test output quiet.
  vi.spyOn(console, 'info').mockImplementation(() => {});
  await getDb().insert(accounts).values({ id: 'acc_pending', email: 'pending@example.org', name: 'Pending', passwordHash: 'disabled', status: 'pending_email' });
  await getDb().insert(accounts).values({ id: 'acc_active', email: 'active@example.org', name: 'Active', passwordHash: 'disabled', status: 'active' });
});

afterEach(() => {
  vi.restoreAllMocks();
  local.sqlite.close();
  for (const key of Object.keys(env)) delete env[key];
});

describe('a new confirmation link', () => {
  it('replaces the link for an account still waiting to be confirmed', async () => {
    const first = await resend('Pending@Example.org');
    expect(first.status).toBe(303);
    expect(landing(first).pathname).toBe('/account/check-email');
    expect(landing(first).searchParams.get('resent')).toBe('1');
    expect(count("WHERE purpose = 'verify_email' AND used_at IS NULL")).toBe(1);
    await resend('pending@example.org');
    // Only the newest link works.
    expect(count("WHERE purpose = 'verify_email' AND used_at IS NULL")).toBe(1);
    expect(count()).toBe(2);
  });

  it('answers the same way for an unknown or confirmed address, and sends nothing', async () => {
    for (const email of ['nobody@example.org', 'active@example.org']) {
      const response = await resend(email);
      expect(landing(response).pathname).toBe('/account/check-email');
      expect(landing(response).searchParams.get('resent')).toBe('1');
    }
    expect(count()).toBe(0);
  });

  it('sends at most three links an hour to one address, however the address is written', async () => {
    const spellings = ['pending@example.org', 'PENDING@example.org', 'Pending@Example.org', 'pending@EXAMPLE.org', 'pending@example.ORG'];
    for (const [i, email] of spellings.entries()) await resend(email, `203.0.113.${i + 1}`);
    expect(count()).toBe(3);
  });

  it('asks for an address when none is given', async () => {
    expect((await resend('')).headers.get('location')).toBe(`${ORIGIN}/account/sign-in?verify=resend_missing`);
  });
});
