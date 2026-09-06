import { describe, expect, it, vi } from 'vitest';
vi.mock('cloudflare:workers', () => ({ env: {} }));
import { purchasabilityIssues } from '@/lib/catalog-readiness';
describe('catalog readiness', () => {
  it('reports missing prices and missing released lots independently', () => {
    expect(purchasabilityIssues(null, '2 mg', [])).toHaveLength(2);
    expect(purchasabilityIssues(100, '2 mg', [])).toEqual(['No released lot']);
  });
  it('requires actual quantity for the selected pack and excludes overdue retest stock', () => {
    expect(purchasabilityIssues(100, '2 mg', [{ quantityRemaining: '1 mg', retestDate: null }])).toHaveLength(1);
    expect(purchasabilityIssues(100, '2 mg', [{ quantityRemaining: '3 mg', retestDate: new Date(0) }])).toHaveLength(1);
    expect(purchasabilityIssues(100, '2 mg', [{ quantityRemaining: '3 mg', retestDate: null }])).toEqual([]);
  });
});
