import { allow, clientAddress, currentCount, rateLimitKey } from '@/lib/rate-limit';

/**
 * Failed sign-in attempts from one network.
 *
 * Accounts lock after ten wrong passwords, and nothing limited the attempts
 * themselves: anyone who knew an address could keep its owner locked out, and one
 * machine could try passwords across every account. A network is now refused once it
 * reaches eight failures in a fifteen-minute window, before any password is checked.
 * That caps password spraying from one machine and slows lockout abuse, though an
 * account's own failure count carries across windows, so it cannot rule that out.
 *
 * Only failures count: a team signing in from one office is never throttled by its
 * own successful sign-ins. Customer and staff sign-in are counted separately.
 */
export const SIGN_IN_FAILURE_LIMIT = 8;
export const SIGN_IN_WINDOW_SECONDS = 15 * 60;

export type SignInAudience = 'account' | 'staff';

function failureKey(audience: SignInAudience, request: Request): string {
  return rateLimitKey(`sign-in:${audience}`, clientAddress(request));
}

export async function signInThrottled(audience: SignInAudience, request: Request): Promise<boolean> {
  return (await currentCount(failureKey(audience, request), SIGN_IN_WINDOW_SECONDS)) >= SIGN_IN_FAILURE_LIMIT;
}

export async function recordSignInFailure(audience: SignInAudience, request: Request): Promise<void> {
  await allow(failureKey(audience, request), SIGN_IN_FAILURE_LIMIT, SIGN_IN_WINDOW_SECONDS);
}
