import { describe, expect, it } from 'vitest';
import {
  matchesOrderQueue,
  orderNextStep,
  orderQueue,
  searchMaterials,
  searchQuery,
} from '@/lib/workflow-display';

const materials = [
  {
    name: 'BPC-157',
    code: 'NPL-001',
    casNumber: '137525-51-0',
    synonyms: ['BPC 157'],
  },
  {
    name: 'beta-NAD+',
    code: 'NPL-002',
    casNumber: '53-84-9',
    synonyms: ['NAD'],
  },
];
describe('catalog search', () => {
  it('normalizes malformed and repeated parameters without throwing', () => {
    expect(searchQuery(['one', 'two'])).toBe('');
    expect(searchQuery(null)).toBe('');
    expect(searchQuery('x'.repeat(200))).toHaveLength(120);
  });
  it('returns all published input for blank searches', () =>
    expect(searchMaterials(materials, '  ')).toEqual(materials));
  it.each(['bpc-157', 'npl-001', '137525-51-0', ' BPC 157 ', 'bpc npl'])(
    'finds a material by %s',
    (q) => expect(searchMaterials(materials, q)).toEqual([materials[0]]),
  );
  it('returns an honest empty result', () =>
    expect(searchMaterials(materials, 'unknown')).toEqual([]));
  it('requires every search term', () =>
    expect(searchMaterials(materials, 'BPC NAD')).toEqual([]));
});
describe('workflow display', () => {
  it.each(['__proto__', 'constructor', 'bad', undefined])(
    'rejects invalid queue %s',
    (q) => expect(orderQueue(q)).toBe('all'),
  );
  it('filters refunds by payment status, including shipped orders', () =>
    expect(
      matchesOrderQueue(
        { status: 'shipped', paymentStatus: 'refund_due' },
        'refund_due',
      ),
    ).toBe(true));
  it('does not confuse paid and awaiting-payment orders', () =>
    expect(
      matchesOrderQueue(
        { status: 'awaiting_payment', paymentStatus: 'pending' },
        'paid',
      ),
    ).toBe(false));
  it('prioritizes refund instructions over normal shipping guidance', () =>
    expect(
      orderNextStep({ status: 'shipped', paymentStatus: 'refund_due' }),
    ).toContain('No further payment'));
  it('does not request payment for closed orders', () =>
    expect(
      orderNextStep({ status: 'cancelled', paymentStatus: 'refunded' }),
    ).toContain('closed'));
  it.each(['submitted', 'awaiting_payment', 'paid', 'fulfilling', 'shipped'])(
    'has customer and staff guidance for %s',
    (status) => {
      expect(orderNextStep({ status, paymentStatus: 'unpaid' })).not.toContain(
        'confirm the next step',
      );
      expect(
        orderNextStep({ status, paymentStatus: 'unpaid' }, true),
      ).not.toContain('confirm the next step');
    },
  );
});
