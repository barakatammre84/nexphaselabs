import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { localD1 } from './helpers/local-d1';

const { env } = vi.hoisted(() => ({ env: {} as { DB?: D1Database } }));
vi.mock('cloudflare:workers', () => ({ env }));
vi.mock('next/headers', () => ({ cookies: vi.fn(), headers: vi.fn() }));
vi.mock('next/navigation', () => ({ redirect: vi.fn() }));

import { getDb } from '@/db';
import { accounts, staffUsers } from '@/db/schema';
import { POST as accountSignIn } from '@/app/api/account/sign-in/route';
import { POST as staffSignIn } from '@/app/api/staff/sign-in/route';
import { SIGN_IN_FAILURE_LIMIT } from '@/lib/sign-in-throttle';
import { hashPassword } from '@/lib/staff-auth-core';

const ORIGIN = 'https://example.invalid';
const password = 'Synthetic-Password-123!';
let local: ReturnType<typeof localD1>;

function post(path: string, values: Record<string, string>, ip: string) {
  const body = new FormData();
  for (const [key, value] of Object.entries(values)) body.set(key, value);
  return new Request(`${ORIGIN}${path}`, {
    method: 'POST',
    headers: { Origin: ORIGIN, Host: new URL(ORIGIN).host, 'CF-Connecting-IP': ip },
    body,
  });
}
const reason = (response: Response) => new URL(response.headers.get('location')!).searchParams.get('error');

beforeEach(async () => {
  local = localD1();
  env.DB = local.binding;
  const passwordHash = await hashPassword(password);
  await getDb().insert(accounts).values({ id: 'account_test', email: 'test@example.org', name: 'Test', passwordHash, tier: 'institutional', status: 'active' });
  await getDb().insert(staffUsers).values({ id: 'staff_test', email: 'staff@example.org', name: 'Test staff', passwordHash, role: 'admin' });
});

afterEach(() => {
  local.sqlite.close();
  delete env.DB;
});

describe('sign-in throttling', () => {
  it('refuses a network after eight failures, before checking any password, and leaves other networks alone', async () => {
    for (let i = 0; i < SIGN_IN_FAILURE_LIMIT; i++) {
      const refused = await accountSignIn(post('/api/account/sign-in', { email: 'test@example.org', password: 'wrong-password-1' }, '198.51.100.9'));
      expect(reason(refused)).toBe('invalid');
    }
    // Refused before the password is checked, even the right one.
    const throttled = await accountSignIn(post('/api/account/sign-in', { email: 'test@example.org', password }, '198.51.100.9'));
    expect(reason(throttled)).toBe('throttled');
    expect(local.sqlite.prepare("SELECT failed_attempts, locked_until FROM accounts WHERE id = 'account_test'").get()).toEqual({
      failed_attempts: SIGN_IN_FAILURE_LIMIT,
      locked_until: null,
    });
    const elsewhere = await accountSignIn(post('/api/account/sign-in', { email: 'test@example.org', password }, '203.0.113.20'));
    expect(reason(elsewhere)).toBeNull();
    expect(elsewhere.headers.get('set-cookie')).toContain('nx_account=');
  });

  it('counts staff and customer failures separately, and never counts a successful sign-in', async () => {
    for (let i = 0; i < SIGN_IN_FAILURE_LIMIT; i++) {
      await accountSignIn(post('/api/account/sign-in', { email: 'nobody@example.org', password: 'wrong-password-1' }, '198.51.100.9'));
    }
    const staff = await staffSignIn(post('/api/staff/sign-in', { email: 'staff@example.org', password }, '198.51.100.9'));
    expect(reason(staff)).toBeNull();
    expect(staff.headers.get('set-cookie')).toContain('nx_staff=');
    for (let i = 0; i <= SIGN_IN_FAILURE_LIMIT; i++) {
      const again = await staffSignIn(post('/api/staff/sign-in', { email: 'staff@example.org', password }, '203.0.113.30'));
      expect(reason(again)).toBeNull();
    }
  });
});
