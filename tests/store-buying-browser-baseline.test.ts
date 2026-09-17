import { describe, expect, it } from 'vitest';
import { classifyBrowserRequest } from '@/lib/store-buying-browser-baseline';

describe('staging browser network safety', () => {
  it('classifies every customer-side effect that must remain untouched', () => {
    expect(classifyBrowserRequest('https://staging.example/api/orders')).toBe(
      'order',
    );
    expect(
      classifyBrowserRequest('https://staging.example/api/payments/start'),
    ).toBe('payment');
    expect(
      classifyBrowserRequest('https://staging.example/api/notifications/send'),
    ).toBe('email');
    expect(
      classifyBrowserRequest('https://staging.example/api/shipping/labels'),
    ).toBe('label');
  });

  it('does not treat the intended sign-in, cart, or quote routes as unsafe', () => {
    for (const route of [
      '/api/account/sign-in',
      '/api/cart',
      '/api/checkout/quotes',
      '/account/cart',
    ]) {
      expect(classifyBrowserRequest(`https://staging.example${route}`)).toBe(
        undefined,
      );
    }
  });
});
