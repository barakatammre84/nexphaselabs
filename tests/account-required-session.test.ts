import { describe, expect, it, vi } from 'vitest';

// Owner decision of 16 September 2026: while ACCOUNT_REQUIRED is set the guest
// paths are closed even though OPEN_CHECKOUT_ENABLED stays true for signed-in
// accounts. These guards run before any database access.
const env = vi.hoisted(() => ({
  APP_ENV: 'test',
  OPEN_CHECKOUT_ENABLED: 'true',
  ACCOUNT_REQUIRED: 'true',
}) as Record<string, string | undefined>);
vi.mock('cloudflare:workers', () => ({ env }));
vi.mock('next/headers', () => ({
  cookies: async () => ({ get: () => undefined }),
}));
vi.mock('next/navigation', () => ({
  redirect: (to: string) => {
    throw new Error(to);
  },
}));

import { createGuestBuyer, guestForToken } from '@/lib/buyer-session';
import { accountRequired, openCheckoutEnabled } from '@/lib/site-config';

describe('guest checkout with ACCOUNT_REQUIRED', () => {
  it('reads both switches', () => {
    expect(openCheckoutEnabled()).toBe(true);
    expect(accountRequired()).toBe(true);
  });

  it('never resolves a guest session', async () => {
    await expect(guestForToken('a'.repeat(64))).resolves.toBeNull();
  });

  it('refuses to create a guest buyer', async () => {
    await expect(createGuestBuyer(true)).rejects.toThrow('Guest checkout disabled');
  });

  it('reopens the guest paths only when the switch is off', async () => {
    env.ACCOUNT_REQUIRED = 'false';
    expect(accountRequired()).toBe(false);
    // With the switch off the token shape is still validated before any lookup.
    await expect(guestForToken('not-a-token')).resolves.toBeNull();
    env.ACCOUNT_REQUIRED = 'true';
  });
});
