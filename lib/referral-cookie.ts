import { normaliseAffiliateCode } from '@/lib/affiliate-rules';

/**
 * The partner referral cookie (owner, 16 Sep 2026). Set by /r/<code> and read once, when an
 * account is created. It holds a partner code and nothing about the visitor, and it is
 * deliberately short-lived: a link followed three months ago did not introduce anybody.
 */
export const REFERRAL_COOKIE = 'nx_ref';
export const REFERRAL_COOKIE_DAYS = 90;

export function referralCookie(code: string, secure: boolean): string {
  const attributes = [
    `${REFERRAL_COOKIE}=${encodeURIComponent(code)}`,
    'Path=/',
    `Max-Age=${REFERRAL_COOKIE_DAYS * 86_400}`,
    'HttpOnly',
    'SameSite=Lax',
  ];
  if (secure) attributes.push('Secure');
  return attributes.join('; ');
}

/** Clears it once it has been used, so a second account is not attributed to the same link. */
export function clearReferralCookie(secure: boolean): string {
  return `${REFERRAL_COOKIE}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax${secure ? '; Secure' : ''}`;
}

export function readReferralCookie(header: string | null): string | null {
  if (!header) return null;
  for (const part of header.split(';')) {
    const [name, ...rest] = part.trim().split('=');
    if (name !== REFERRAL_COOKIE) continue;
    try {
      return normaliseAffiliateCode(decodeURIComponent(rest.join('=')));
    } catch {
      return null;
    }
  }
  return null;
}
