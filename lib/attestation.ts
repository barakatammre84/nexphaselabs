import {
  GUEST_CHECKOUT_TERMS_VERSION,
  AGE_STATEMENT,
  RUO_ACKNOWLEDGEMENT,
  RUO_VERSION,
  TERMS_VERSION,
} from '@/lib/policy';
import { RESEARCH_SETTINGS } from '@/lib/account-rules';

/**
 * Structured research-use attestation evidence, written onto the order at
 * submission. This exists because an account holder's acceptance is stored as
 * columns while a guest's used to live only as prose inside an event note —
 * which cannot be queried, exported, or produced on demand in one shape.
 */
export type OrderAttestation = {
  ruoVersion: string;
  termsVersion: string;
  acknowledgementHash: string;
  acknowledgedAt: Date;
  acknowledgedFrom: string | null;
  researchSetting: string | null;
  /** The buyer ticked the age statement (AGE_STATEMENT) for this order. */
  ageConfirmed: boolean;
};

let cachedHash: string | null = null;

/** Lowercase hex SHA-256 of the exact wording in force: the research-use acknowledgement and the age statement, newline-joined. */
export async function acknowledgementHash(): Promise<string> {
  if (cachedHash) return cachedHash;
  const bytes = new TextEncoder().encode(`${RUO_ACKNOWLEDGEMENT}\n${AGE_STATEMENT}`);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  cachedHash = [...new Uint8Array(digest)]
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  return cachedHash;
}

/** The connecting address, as e-sign evidence. Never trusted for anything else. */
export function connectingAddress(request: Request): string | null {
  const ip =
    request.headers.get('cf-connecting-ip') ??
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    null;
  return ip && ip.length <= 64 ? ip : null;
}

/** A research setting is accepted only from the fixed list; anything else is dropped, never stored. */
export function normaliseResearchSetting(raw: unknown): string | null {
  const value = typeof raw === 'string' ? raw.trim() : '';
  return (RESEARCH_SETTINGS as readonly string[]).includes(value) ? value : null;
}

export async function buildOrderAttestation(input: {
  guest: boolean;
  now: Date;
  from: string | null;
  researchSetting: string | null;
  ageConfirmed: boolean;
}): Promise<OrderAttestation> {
  return {
    ruoVersion: RUO_VERSION,
    termsVersion: input.guest ? GUEST_CHECKOUT_TERMS_VERSION : TERMS_VERSION,
    acknowledgementHash: await acknowledgementHash(),
    acknowledgedAt: input.now,
    acknowledgedFrom: input.from,
    researchSetting: input.researchSetting,
    ageConfirmed: input.ageConfirmed,
  };
}
