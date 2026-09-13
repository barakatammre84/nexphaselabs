import { describe, expect, it } from 'vitest';
import {
  effectiveUnitPrice,
  nextBreak,
  parsePriceBreaks,
  priceBreaksToCell,
  priceLadder,
  readPriceBreaks,
  validatePriceBreaks,
  type PriceBreak,
} from '@/lib/price-breaks';

/**
 * Volume pricing. The rule that matters most is the one about invention: this
 * module must never produce a price nobody typed, and must never let a
 * "discount" raise one.
 */

const variant = { listPriceCents: 5850, institutionalPriceCents: 5200 };
const ladder: PriceBreak[] = [
  { minQuantity: 4, listPriceCents: 5265, institutionalPriceCents: 4800 },
  { minQuantity: 6, listPriceCents: 4914, institutionalPriceCents: 4500 },
  { minQuantity: 10, listPriceCents: 4388, institutionalPriceCents: 4000 },
];

describe('reading what the manager typed', () => {
  it('parses a ladder', () => {
    const { breaks, issues } = parsePriceBreaks('4:52.65, 6:49.14, 10:43.88');
    expect(issues).toEqual([]);
    expect(breaks).toEqual([
      { minQuantity: 4, listPriceCents: 5265, institutionalPriceCents: null },
      { minQuantity: 6, listPriceCents: 4914, institutionalPriceCents: null },
      { minQuantity: 10, listPriceCents: 4388, institutionalPriceCents: null },
    ]);
  });

  it('parses both prices when a row carries them', () => {
    expect(parsePriceBreaks('4:52.65/48.00').breaks[0]).toEqual({
      minQuantity: 4,
      listPriceCents: 5265,
      institutionalPriceCents: 4800,
    });
  });

  it('says what is wrong instead of guessing', () => {
    expect(parsePriceBreaks('four:52.65').issues[0]).toContain('whole number');
    expect(parsePriceBreaks('4:fifty').issues[0]).toContain('price in dollars');
    expect(parsePriceBreaks('4:').issues[0]).toContain('sets no price');
    expect(parsePriceBreaks('4:52.6543').issues[0]).toContain('price in dollars');
  });

  it('treats an empty cell as no volume pricing at all', () => {
    expect(parsePriceBreaks('').breaks).toEqual([]);
    expect(parsePriceBreaks('   ').issues).toEqual([]);
  });

  it('round-trips through the editable cell', () => {
    const cell = '4:52.65, 6:49.14/45.00';
    expect(priceBreaksToCell(parsePriceBreaks(cell).breaks)).toBe(cell);
  });
});

describe('what the rules refuse', () => {
  it('accepts a well-formed ladder', () => {
    expect(validatePriceBreaks(ladder, variant)).toEqual([]);
  });

  it('refuses a price that is not below the list price', () => {
    const issues = validatePriceBreaks([{ minQuantity: 4, listPriceCents: 5850, institutionalPriceCents: null }], variant);
    expect(issues[0]).toContain('not below the list price');
  });

  it('refuses a ladder that goes back up', () => {
    const issues = validatePriceBreaks(
      [
        { minQuantity: 4, listPriceCents: 5000, institutionalPriceCents: null },
        { minQuantity: 6, listPriceCents: 5200, institutionalPriceCents: null },
      ],
      variant,
    );
    expect(issues[0]).toContain('not below the one for the smaller quantity');
  });

  it('refuses a break at one unit, a duplicate threshold, and a free vial', () => {
    expect(validatePriceBreaks([{ minQuantity: 1, listPriceCents: 100, institutionalPriceCents: null }], variant).join(' '))
      .toContain('2 units or more');
    expect(
      validatePriceBreaks(
        [
          { minQuantity: 4, listPriceCents: 5000, institutionalPriceCents: null },
          { minQuantity: 4, listPriceCents: 4900, institutionalPriceCents: null },
        ],
        variant,
      ).join(' '),
    ).toContain('both start at 4 units');
    expect(validatePriceBreaks([{ minQuantity: 4, listPriceCents: 0, institutionalPriceCents: null }], variant).join(' '))
      .toContain('more than zero');
  });

  it('refuses a volume price for a tier that has no price to discount', () => {
    const issues = validatePriceBreaks(
      [{ minQuantity: 4, listPriceCents: null, institutionalPriceCents: 4800 }],
      { listPriceCents: 5850, institutionalPriceCents: null },
    );
    expect(issues[0]).toContain('no institutional price to discount');
  });

  it('caps the ladder length', () => {
    const many = Array.from({ length: 9 }, (_, i) => ({
      minQuantity: i + 2,
      listPriceCents: 5800 - i * 100,
      institutionalPriceCents: null,
    }));
    expect(validatePriceBreaks(many, variant).join(' ')).toContain('At most 8');
  });
});

describe('the price a customer pays', () => {
  it('is the variant price until a threshold is reached', () => {
    expect(effectiveUnitPrice(variant, ladder, 1, 'researcher')).toBe(5850);
    expect(effectiveUnitPrice(variant, ladder, 3, 'researcher')).toBe(5850);
  });

  it('steps down at each threshold and stays there', () => {
    expect(effectiveUnitPrice(variant, ladder, 4, 'researcher')).toBe(5265);
    expect(effectiveUnitPrice(variant, ladder, 5, 'researcher')).toBe(5265);
    expect(effectiveUnitPrice(variant, ladder, 6, 'researcher')).toBe(4914);
    expect(effectiveUnitPrice(variant, ladder, 99, 'researcher')).toBe(4388);
  });

  it('uses the institutional ladder for an institutional viewer', () => {
    expect(effectiveUnitPrice(variant, ladder, 4, 'institutional')).toBe(4800);
    expect(effectiveUnitPrice(variant, ladder, 10, 'institutional')).toBe(4000);
  });

  it('prices at list when a viewer may not see a price at all', () => {
    expect(effectiveUnitPrice(variant, ladder, 10, 'none')).toBeNull();
    expect(effectiveUnitPrice({ listPriceCents: null, institutionalPriceCents: null }, ladder, 10, 'researcher')).toBeNull();
  });

  it('never lets a bad row raise the price', () => {
    const wrong: PriceBreak[] = [{ minQuantity: 2, listPriceCents: 9900, institutionalPriceCents: null }];
    expect(effectiveUnitPrice(variant, wrong, 5, 'researcher')).toBe(5850);
  });

  it('falls through a tier that has no price on the break row', () => {
    const partial: PriceBreak[] = [{ minQuantity: 4, listPriceCents: 5265, institutionalPriceCents: null }];
    expect(effectiveUnitPrice(variant, partial, 4, 'institutional')).toBe(5200);
  });
});

describe('what the product page shows', () => {
  it('shows nothing at all when no volume price was entered', () => {
    expect(priceLadder(variant, [], 'researcher')).toEqual([]);
    expect(nextBreak(variant, [], 1, 'researcher')).toBeNull();
  });

  it('starts the ladder at one unit and marks the row in force', () => {
    const rows = priceLadder(variant, ladder, 'researcher', 5);
    expect(rows.map((row) => row.minQuantity)).toEqual([1, 4, 6, 10]);
    expect(rows.map((row) => row.savingPercent)).toEqual([0, 10, 16, 25]);
    expect(rows.find((row) => row.applies)!.minQuantity).toBe(4);
  });

  it('says how far the next break is and what it is worth', () => {
    const next = nextBreak(variant, ladder, 1, 'researcher')!;
    expect(next).toMatchObject({ unitsAway: 3, minQuantity: 4, unitPriceCents: 5265 });
    expect(next.savesCents).toBe((5850 - 5265) * 4);
    expect(nextBreak(variant, ladder, 10, 'researcher')).toBeNull();
  });
});

describe('reading what is stored', () => {
  it('ignores anything malformed rather than pricing from it', () => {
    expect(readPriceBreaks(null)).toEqual([]);
    expect(readPriceBreaks('not json')).toEqual([]);
    expect(readPriceBreaks([{ minQuantity: 1, listPriceCents: 10 }])).toEqual([]);
    expect(readPriceBreaks([{ minQuantity: 4 }])).toEqual([]);
    expect(readPriceBreaks([{ minQuantity: '4', listPriceCents: 5265 }])).toEqual([]);
  });

  it('sorts what it keeps', () => {
    expect(
      readPriceBreaks([
        { minQuantity: 10, listPriceCents: 4388, institutionalPriceCents: null },
        { minQuantity: 4, listPriceCents: 5265, institutionalPriceCents: null },
      ]).map((row) => row.minQuantity),
    ).toEqual([4, 10]);
  });
});
