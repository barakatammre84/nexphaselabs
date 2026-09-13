import { describe, expect, it, vi } from 'vitest';
vi.mock('cloudflare:workers', () => ({ env: {} }));
import { containerMatches } from '@/lib/inventory-reservations';
import { lotSuppliesPack } from '@/lib/lot-quantities';

/**
 * Sealed containers are not a bulk mass. A lot counted in vials supplies only a
 * pack whose size equals what one vial is labeled to hold — never a smaller pack
 * (the vial cannot be split) and never a larger one (two vials are not one pack).
 */
describe('count-tracked lots supply exactly their container size', () => {
  it('matches a 50 mg vial to a 50 mg pack only', () => {
    expect(containerMatches('50 mg', 50_000)).toBe(true);
    expect(containerMatches('50 mg', 10_000)).toBe(false);
    expect(containerMatches('0.05 g', 50_000)).toBe(true);
    expect(containerMatches(null, 50_000)).toBe(false);
    expect(containerMatches('3 mL', 50_000)).toBe(false);
  });
  it('lotSuppliesPack applies the mass rule to bulk lots and the container rule to counted lots', () => {
    expect(lotSuppliesPack({ quantityRemaining: '2 g', containerSize: null }, '50 mg')).toBe(true);
    expect(lotSuppliesPack({ quantityRemaining: '20 mg', containerSize: null }, '50 mg')).toBe(false);
    expect(lotSuppliesPack({ quantityRemaining: '47 vials', containerSize: '50 mg' }, '50 mg')).toBe(true);
    expect(lotSuppliesPack({ quantityRemaining: '47 vials', containerSize: '50 mg' }, '10 mg')).toBe(false);
    expect(lotSuppliesPack({ quantityRemaining: '47 vials', containerSize: null }, '50 mg')).toBe(false);
    expect(lotSuppliesPack({ quantityRemaining: '0 vials', containerSize: '50 mg' }, '50 mg')).toBe(false);
  });
});
