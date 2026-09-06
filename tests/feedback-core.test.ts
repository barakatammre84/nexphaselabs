import { describe, expect, it } from 'vitest';
import {
  bearerMatches,
  feedbackCookie,
  feedbackToken,
  normalizeFeedbackMessage,
  normalizeFeedbackProfile,
  normalizeFeedbackReport,
  normalizeSourcePath,
} from '@/lib/feedback-core';

describe('feedback input and access primitives', () => {
  it('normalizes bounded plain-text feedback and rejects empty, oversized, or newline-flooded input', () => {
    expect(normalizeFeedbackMessage('  line one\r\nline two  ')).toBe(
      'line one\nline two',
    );
    expect(normalizeFeedbackMessage('')).toBeNull();
    expect(normalizeFeedbackMessage('x'.repeat(2001))).toBeNull();
    expect(
      normalizeFeedbackMessage(
        Array.from({ length: 41 }, () => 'x').join('\n'),
      ),
    ).toBeNull();
  });

  it('keeps optional profile data bounded and email-shaped without requiring identity verification', () => {
    expect(normalizeFeedbackProfile('', '')).toEqual({
      name: null,
      email: null,
    });
    expect(
      normalizeFeedbackProfile(' Test User ', ' USER@Example.org '),
    ).toEqual({
      name: 'Test User',
      email: 'user@example.org',
    });
    expect(
      normalizeFeedbackProfile('Test\nInjected', 'test@example.org'),
    ).toBeNull();
    expect(normalizeFeedbackProfile('Test', 'not-an-email')).toBeNull();
  });

  it('normalizes developer report type, impact, expectation, and bounded browser context', () => {
    expect(
      normalizeFeedbackReport({
        kind: 'bug',
        severity: 'blocking',
        title: 'Checkout button does not respond',
        expectedBehavior: 'The order review should open.',
        context: {
          userAgent: 'Synthetic Browser',
          language: 'en-US',
          timezone: 'America/Los_Angeles',
          viewport: { width: 1440, height: 900 },
          annotation: {
            kind: 'text',
            selector: 'main > h1',
            label: 'Checkout',
            selectedText: 'Review order',
            rect: { x: 20, y: 40, width: 200, height: 36 },
          },
          ignored: 'not retained',
        },
      }),
    ).toEqual({
      kind: 'bug',
      severity: 'blocking',
      title: 'Checkout button does not respond',
      expectedBehavior: 'The order review should open.',
      browserContext: JSON.stringify({
        userAgent: 'Synthetic Browser',
        language: 'en-US',
        timezone: 'America/Los_Angeles',
        viewport: { width: 1440, height: 900 },
        devicePixelRatio: 1,
        annotation: {
          kind: 'text',
          selector: 'main > h1',
          label: 'Checkout',
          selectedText: 'Review order',
          rect: { x: 20, y: 40, width: 200, height: 36 },
        },
        annotations: [
          {
            kind: 'text',
            selector: 'main > h1',
            label: 'Checkout',
            selectedText: 'Review order',
            rect: { x: 20, y: 40, width: 200, height: 36 },
          },
        ],
      }),
    });
    expect(normalizeFeedbackReport({ kind: 'improvement' })?.severity).toBe(
      'suggestion',
    );
    expect(normalizeFeedbackReport({ title: 'x'.repeat(101) })).toBeNull();
  });

  it('records only a bounded same-site path and uses a private durable cookie', () => {
    expect(normalizeSourcePath('/catalog/item?secret=value#part')).toBe(
      '/catalog/item#part',
    );
    expect(normalizeSourcePath('//evil.example/path')).toBe('/');
    const token = 'a'.repeat(64);
    const cookie = feedbackCookie(token, true);
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('SameSite=Lax');
    expect(cookie).toContain('Secure');
    expect(
      feedbackToken(
        new Request('https://test.example', { headers: { cookie } }),
      ),
    ).toBe(token);
  });

  it('compares the read-only archive bearer token without comparing raw secrets', async () => {
    const secret = 'archive-secret-at-least-thirty-two-characters';
    expect(await bearerMatches(`Bearer ${secret}`, secret)).toBe(true);
    expect(
      await bearerMatches(
        'Bearer wrong-secret-at-least-thirty-two-characters',
        secret,
      ),
    ).toBe(false);
    expect(await bearerMatches(null, secret)).toBe(false);
  });
});
