import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { env, writeDataPoint } = vi.hoisted(() => ({
  env: {} as Record<string, unknown>,
  writeDataPoint: vi.fn(),
}));
vi.mock('cloudflare:workers', () => ({ env }));

import { COMMERCE_EVENT_NAMES, recordCommerceEvent } from '@/lib/commerce-events';

beforeEach(() => {
  writeDataPoint.mockReset();
  env.COMMERCE_ANALYTICS_ENABLED = 'true';
  env.COMMERCE_EVENTS = { writeDataPoint };
});
afterEach(() => {
  Object.keys(env).forEach(key => delete env[key]);
  vi.restoreAllMocks();
});

describe('anonymous Cloudflare commerce events', () => {
  it.each(COMMERCE_EVENT_NAMES)('writes the fixed versioned columns for %s', name => {
    recordCommerceEvent(name);
    expect(writeDataPoint).toHaveBeenCalledExactlyOnceWith({
      indexes: ['commerce_v1'],
      blobs: [name, 'storefront'],
      doubles: [1, 0],
    });
    expect(name).toMatch(/^[a-z_]+$/);
    expect(name.length).toBeLessThan(50);
  });

  it('includes only aggregate quantity and allowlisted source', () => {
    recordCommerceEvent('cart_item_added', { quantity: 75 });
    recordCommerceEvent('newsletter_confirmed', { source: 'account' });
    expect(writeDataPoint.mock.calls).toEqual([
      [{ indexes: ['commerce_v1'], blobs: ['cart_item_added', 'storefront'], doubles: [1, 75] }],
      [{ indexes: ['commerce_v1'], blobs: ['newsletter_confirmed', 'account'], doubles: [1, 0] }],
    ]);
  });

  it('does not forward extra fields even if a caller passes a larger object', () => {
    const fields = {
      quantity: 2, email: 'private@example.invalid', accountId: 'private-account',
      orderId: 'private-order', url: '/newsletter/confirm?token=private-token',
      ip: '192.0.2.1', note: 'private text',
    };
    recordCommerceEvent('cart_item_added', fields);
    expect(writeDataPoint).toHaveBeenCalledExactlyOnceWith({
      indexes: ['commerce_v1'], blobs: ['cart_item_added', 'storefront'], doubles: [1, 2],
    });
    expect(JSON.stringify(writeDataPoint.mock.calls)).not.toContain('private');
  });

  it.each([undefined, 'false', 'TRUE', '1', ''])('collects nothing unless explicitly enabled (%s)', enabled => {
    env.COMMERCE_ANALYTICS_ENABLED = enabled;
    recordCommerceEvent('order_submitted');
    expect(writeDataPoint).not.toHaveBeenCalled();
  });

  it('keeps working when enabled without a binding', () => {
    delete env.COMMERCE_EVENTS;
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(() => recordCommerceEvent('order_submitted')).not.toThrow();
    expect(writeDataPoint).not.toHaveBeenCalled();
  });

  it('contains provider failures without logging their body or rejecting the operation', async () => {
    const log = vi.spyOn(console, 'warn').mockImplementation(() => {});
    writeDataPoint.mockImplementationOnce(() => { throw new Error('private@example.invalid'); });
    expect(() => recordCommerceEvent('order_submitted')).not.toThrow();
    writeDataPoint.mockRejectedValueOnce(new Error('private-token'));
    expect(() => recordCommerceEvent('order_submitted')).not.toThrow();
    await Promise.resolve();
    await Promise.resolve();
    expect(JSON.stringify(log.mock.calls)).not.toContain('private');
  });

  it.each([-1, 1.2, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1])('rejects invalid aggregate quantities (%s)', quantity => {
    recordCommerceEvent('cart_item_added', { quantity });
    expect(writeDataPoint).not.toHaveBeenCalled();
  });

  it('rejects untyped unknown event names and free-form sources', () => {
    // Exercise runtime callers as well as the TypeScript closed union.
    // @ts-expect-error intentionally invalid event
    recordCommerceEvent('private@example.invalid');
    // @ts-expect-error intentionally invalid source
    recordCommerceEvent('newsletter_confirmed', { source: 'private-token' });
    expect(writeDataPoint).not.toHaveBeenCalled();
  });
});