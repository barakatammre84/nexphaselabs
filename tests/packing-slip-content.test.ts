import { describe, expect, it } from 'vitest';
import {
  buildPackingSlipContent,
  packingSlipBlockers,
  packingSlipNumber,
  packingSlipSequenceKey,
  type PackingSlipLine,
  type PackingSlipSubject,
} from '@/lib/packing-slip-content';
import { REGULATORY_STATEMENT } from '@/lib/catalog';

const line = (over: Partial<PackingSlipLine> = {}): PackingSlipLine => ({
  sku: 'NPL-001-5MG',
  productCode: 'NPL-001',
  productName: 'BPC-157',
  packSize: '5 mg',
  presentation: 'Lyophilised powder',
  quantity: 2,
  lotNumber: 'CERT-001',
  certificateNumber: 'COA-CERT-001',
  storageCondition: 'Minus 20 C',
  ...over,
});

const subject = (
  order: Partial<PackingSlipSubject['order']> = {},
  lines: PackingSlipLine[] = [line()],
): PackingSlipSubject => ({
  order: {
    orderNumber: 'NPL-1042',
    status: 'fulfilling',
    submittedAt: new Date('2026-09-01T00:00:00Z'),
    carrier: 'FedEx',
    trackingNumber: '7712 3344 5566',
    consigneeName: 'Dr Ada Lovelace',
    consigneeInstitution: 'Example University',
    shipToLine1: '77 Massachusetts Ave',
    shipToLine2: null,
    shipToCity: 'Cambridge',
    shipToRegion: 'MA',
    shipToPostalCode: '02139',
    shipToCountry: 'United States',
    customerNote: null,
    ...order,
  },
  lines,
});

describe('packingSlipBlockers', () => {
  it('passes a fulfilling order whose lines are picked', () => {
    expect(packingSlipBlockers(subject())).toEqual([]);
  });

  it('refuses a line with no lot assigned', () => {
    const blockers = packingSlipBlockers(
      subject({}, [line(), line({ sku: 'NPL-002-10MG', lotNumber: null })]),
    );
    expect(blockers.some((b) => b.includes('no lot assigned'))).toBe(true);
    expect(blockers.some((b) => b.includes('NPL-002-10MG'))).toBe(true);
  });

  it('refuses an order that has not reached fulfilment', () => {
    for (const status of ['submitted', 'awaiting_payment']) {
      expect(
        packingSlipBlockers(subject({ status })).some((b) =>
          b.includes('not reached fulfilment'),
        ),
      ).toBe(true);
    }
  });

  it('refuses a cancelled order', () => {
    expect(
      packingSlipBlockers(subject({ status: 'cancelled' })).some((b) =>
        b.includes('cancelled'),
      ),
    ).toBe(true);
  });

  it('allows a shipped order, so a replacement slip can be reissued', () => {
    expect(packingSlipBlockers(subject({ status: 'shipped' }))).toEqual([]);
  });

  it('refuses an order with no lines', () => {
    expect(packingSlipBlockers(subject({}, []))).toContain('This order has no lines.');
  });
});

describe('buildPackingSlipContent', () => {
  it('states no prices anywhere', () => {
    const content = buildPackingSlipContent(subject());
    const text = JSON.stringify(content);
    expect(text).not.toMatch(/\d+\.\d{2}/);
    expect(Object.keys(content)).not.toContain('totals');
  });

  it('puts the lot and its certificate against the line', () => {
    const content = buildPackingSlipContent(subject());
    expect(content.rows[0].lot).toBe('CERT-001\nCOA-CERT-001');
  });

  it('shows the lot alone when no certificate has been issued', () => {
    const content = buildPackingSlipContent(
      subject({}, [line({ certificateNumber: null })]),
    );
    expect(content.rows[0].lot).toBe('CERT-001');
  });

  it('collapses repeated storage conditions to one note', () => {
    const content = buildPackingSlipContent(
      subject({}, [line(), line({ sku: 'B' }), line({ sku: 'C', storageCondition: 'Ambient' })]),
    );
    expect(content.storageNotes).toEqual(['Minus 20 C', 'Ambient']);
  });

  it('omits storage notes when no lot records one', () => {
    const content = buildPackingSlipContent(
      subject({}, [line({ storageCondition: null })]),
    );
    expect(content.storageNotes).toEqual([]);
  });

  it('drops empty address lines', () => {
    const content = buildPackingSlipContent(subject());
    expect(content.shipTo).not.toContain('');
    expect(content.shipTo[0]).toBe('Dr Ada Lovelace');
  });

  it('carries the conditions of supply', () => {
    expect(buildPackingSlipContent(subject()).statement).toBe(REGULATORY_STATEMENT);
  });

  it('shows the carrier and tracking number for the receiving desk', () => {
    const details = Object.fromEntries(buildPackingSlipContent(subject()).details);
    expect(details.Carrier).toBe('FedEx');
    expect(details['Tracking number']).toBe('7712 3344 5566');
  });
});

describe('numbering', () => {
  it('numbers the first slip without a suffix and reissues from R1', () => {
    expect(packingSlipNumber('npl-1042', 1)).toBe('PS-NPL-1042');
    expect(packingSlipNumber('NPL-1042', 2)).toBe('PS-NPL-1042-R1');
  });

  it('keys the series per order', () => {
    expect(packingSlipSequenceKey(' npl-1042 ')).toBe('packing_slip:NPL-1042');
  });
});
