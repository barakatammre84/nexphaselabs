import { describe, expect, it } from 'vitest';
import { clientAddress, rateLimitKey, windowStart } from '@/lib/rate-limit-core';

describe('rate limit windows', () => {
  it('buckets time into fixed windows', () => {
    const w = windowStart(Date.UTC(2026, 8, 3, 12, 34, 56), 3600);
    expect(w).toBe(Math.floor(Date.UTC(2026, 8, 3, 12, 0, 0) / 1000));
    expect(windowStart(Date.UTC(2026, 8, 3, 12, 59, 59), 3600)).toBe(w);
    expect(windowStart(Date.UTC(2026, 8, 3, 13, 0, 0), 3600)).toBe(w + 3600);
  });
  it('normalises keys', () => {
    expect(rateLimitKey('forgot:email', '  Ada@Example.EDU ')).toBe('forgot:email:ada@example.edu');
    expect(rateLimitKey('x', 'a'.repeat(300)).length).toBe(2 + 200);
  });
});

describe('clientAddress', () => {
  it('prefers the Cloudflare header, then the first forwarded hop', () => {
    expect(clientAddress(new Request('https://x', { headers: { 'cf-connecting-ip': '203.0.113.9', 'x-forwarded-for': '10.0.0.1' } }))).toBe('203.0.113.9');
    expect(clientAddress(new Request('https://x', { headers: { 'x-forwarded-for': '198.51.100.7, 10.0.0.1' } }))).toBe('198.51.100.7');
    expect(clientAddress(new Request('https://x'))).toBe('unknown');
  });
});
