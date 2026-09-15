import { describe, expect, it } from 'vitest';
import { NOTICE_COOKIE, noticeCookie, readNotice, redirectWithNotice } from '@/lib/notice';

const valueOf = (cookie: string) => cookie.split(';')[0].slice(NOTICE_COOKIE.length + 1);

describe('refusal notices', () => {
  it('round-trips a message with punctuation and non-ASCII text', () => {
    const message = 'Only 2 packs left; choose fewer — or contact support (100% refundable).';
    const cookie = noticeCookie(message, true);
    expect(cookie).toMatch(/^nx_notice=[A-Za-z0-9_-]+; Path=\/; Max-Age=120; HttpOnly; SameSite=Lax; Secure$/);
    expect(readNotice(valueOf(cookie))).toBe(message);
  });

  it('keeps a notice short and on one line', () => {
    const text = readNotice(valueOf(noticeCookie(`Line one\r\nline two ${'x'.repeat(400)}`, false)))!;
    expect(text).not.toMatch(/[\r\n]/);
    expect(text.length).toBeLessThanOrEqual(300);
  });

  it('ignores values it did not write', () => {
    expect(readNotice(undefined)).toBeNull();
    expect(readNotice('Send payment to account 12345')).toBeNull();
    expect(readNotice('%%%')).toBeNull();
  });

  it('redirects with only a code in the URL and the words in the cookie', () => {
    const response = redirectWithNotice(
      new Request('https://example.invalid/api/orders', { method: 'POST' }),
      '/account/cart?error=notice',
      'Confirm that you are at least 21 years of age.',
      ['nx_guest=abc; Path=/'],
    );
    expect(response.status).toBe(303);
    expect(response.headers.get('location')).toBe('https://example.invalid/account/cart?error=notice');
    const cookies = response.headers.getSetCookie();
    expect(cookies[0]).toBe('nx_guest=abc; Path=/');
    expect(readNotice(valueOf(cookies[1]))).toBe('Confirm that you are at least 21 years of age.');
  });
});
