import { and, eq } from 'drizzle-orm';
import { getDb } from '@/db';
import { accountAcknowledgements, accounts, type Account } from '@/db/schema';
import { acknowledgementRows, startAccountSession } from '@/lib/account-auth';
import { ACCOUNT_TIERS, ageOn, normaliseEmail, RESEARCH_SETTINGS, type AccountTier } from '@/lib/account-rules';
import type { GoogleIdentity } from '@/lib/google-signin';
import { MINIMUM_AGE, RUO_VERSION, TERMS_VERSION } from '@/lib/policy';
import { randomToken, hashPassword } from '@/lib/staff-auth-core';

/**
 * Turning a Google identity into an account (owner, 16 Sep 2026).
 *
 * Google proves an email address and nothing else. It does not prove age, and it cannot record
 * that somebody read the research-use acknowledgement, so a visitor Google has never sent us
 * before does not get an account here: they get sent to a short completion form, and the account
 * is written only when that form comes back. The disclosure workflow on the compliance page says
 * an acknowledgement is recorded at account creation, and this path keeps that true.
 */

function newId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID().replace(/-/g, '').slice(0, 24)}`;
}

export type GoogleResolution =
  | { outcome: 'signed-in'; token: string; expiresAt: Date; account: Account; linked: boolean }
  | { outcome: 'needs-completion' }
  | { outcome: 'refused'; reason: 'unverified-email' | 'suspended' | 'unavailable' };

/**
 * Matches a Google identity to an existing account, by subject first and address second.
 *
 * Subject before email because a person can change the address on their Google account, and the
 * link should survive that. Matching on address is what links an account somebody already opened
 * with a password, and it is only safe because Google has told us the address is verified; an
 * unverified assertion is refused rather than trusted.
 */
export async function resolveGoogleSignIn(
  identity: GoogleIdentity,
  userAgent: string | null,
  now = new Date(),
): Promise<GoogleResolution> {
  if (!identity.emailVerified) return { outcome: 'refused', reason: 'unverified-email' };
  const db = getDb();
  const email = normaliseEmail(identity.email);

  const [bySubject] = await db.select().from(accounts).where(eq(accounts.googleSubject, identity.subject)).limit(1);
  const [byEmail] = bySubject
    ? [undefined]
    : await db.select().from(accounts).where(eq(accounts.email, email)).limit(1);
  const account = bySubject ?? byEmail;
  if (!account) return { outcome: 'needs-completion' };
  if (account.status === 'suspended') return { outcome: 'refused', reason: 'suspended' };

  const linking = !account.googleSubject;
  // Google's verified assertion is at least as good as a link we posted, so an account that never
  // opened its verification email becomes usable here rather than staying stuck.
  const activating = account.status === 'pending_email';
  if (linking || activating) {
    await db
      .update(accounts)
      .set({
        ...(linking ? { googleSubject: identity.subject, googleLinkedAt: now } : {}),
        ...(activating ? { status: 'active', emailVerifiedAt: account.emailVerifiedAt ?? now } : {}),
        updatedAt: now,
      })
      .where(and(eq(accounts.id, account.id), eq(accounts.status, account.status)));
  }

  const fresh = activating || linking
    ? (await db.select().from(accounts).where(eq(accounts.id, account.id)).limit(1))[0]
    : account;
  if (!fresh || fresh.status !== 'active') return { outcome: 'refused', reason: 'unavailable' };
  const session = await startAccountSession(fresh, userAgent, now);
  if (!session) return { outcome: 'refused', reason: 'unavailable' };
  return { outcome: 'signed-in', token: session.token, expiresAt: session.expiresAt, account: fresh, linked: linking };
}

export type CompletionInput = {
  tier: string;
  researchSetting?: string;
  dateOfBirth: string;
  acceptTerms: boolean;
  acceptRuo: boolean;
  acceptAge: boolean;
};

export type CompletionResult =
  | { ok: true; accountId: string; token: string; expiresAt: Date }
  | { ok: false; errors: string[] };

/**
 * Writes the account a Google sign-in was heading towards, once the visitor has supplied what
 * Google could not. The email is marked verified because Google verified it; the password is set
 * to an unusable random value, so the only ways in are Google or a password reset the account
 * holder starts from their own mailbox.
 */
export async function completeGoogleSignUp(
  identity: GoogleIdentity,
  input: CompletionInput,
  userAgent: string | null,
  researcherTierEnabled: boolean,
  now = new Date(),
): Promise<CompletionResult> {
  const errors: string[] = [];
  const tier = input.tier.trim() as AccountTier;
  if (!(ACCOUNT_TIERS as readonly string[]).includes(tier)) errors.push('Choose an account type.');
  else if (tier === 'researcher' && !researcherTierEnabled)
    errors.push('Accounts are currently opened for research organisations only.');
  if (!input.acceptTerms) errors.push('You must accept the terms of sale.');
  if (!input.acceptRuo) errors.push('You must confirm the research-use acknowledgement.');
  if (!input.acceptAge) errors.push(`You must confirm that you are at least ${MINIMUM_AGE} years of age.`);
  const age = input.dateOfBirth.trim() ? ageOn(input.dateOfBirth.trim(), now) : null;
  if (age === null) errors.push('Enter your date of birth.');
  else if (age < MINIMUM_AGE) errors.push(`You must be at least ${MINIMUM_AGE} years of age to open an account.`);
  const settingRaw = (input.researchSetting ?? '').trim();
  const researchSetting = (RESEARCH_SETTINGS as readonly string[]).includes(settingRaw) ? settingRaw : null;
  if (settingRaw && !researchSetting) errors.push('Choose a research setting from the list.');
  if (errors.length) return { ok: false, errors };

  const db = getDb();
  const email = normaliseEmail(identity.email);
  const accountId = newId('acc');
  try {
    await db.batch([
      db.insert(accounts).values({
        id: accountId,
        email,
        name: identity.name ?? email.split('@')[0],
        // No usable password. A holder who wants one starts a reset from their own mailbox.
        passwordHash: await hashPassword(randomToken()),
        tier,
        researchSetting,
        dateOfBirth: input.dateOfBirth.trim(),
        ageConfirmedAt: now,
        googleSubject: identity.subject,
        googleLinkedAt: now,
        status: 'active',
        emailVerifiedAt: now,
        termsAcceptedAt: now,
        termsVersion: TERMS_VERSION,
        ruoAcceptedAt: now,
        ruoVersion: RUO_VERSION,
        createdAt: now,
        updatedAt: now,
      }),
      db.insert(accountAcknowledgements).values(acknowledgementRows(accountId, now, userAgent)),
    ]);
  } catch (error) {
    // Somebody opened an account on this address between the callback and this form.
    if (/UNIQUE constraint failed/i.test(error instanceof Error ? error.message : String(error)))
      return { ok: false, errors: ['An account already exists for this address. Sign in instead.'] };
    throw error;
  }

  const [account] = await db.select().from(accounts).where(eq(accounts.id, accountId)).limit(1);
  const session = account ? await startAccountSession(account, userAgent, now) : null;
  if (!session) return { ok: false, errors: ['Your account was created. Sign in to continue.'] };
  return { ok: true, accountId, token: session.token, expiresAt: session.expiresAt };
}
