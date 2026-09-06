import { describe, expect, it } from 'vitest';
import {
  buildInvoiceContent,
  invoiceBlockers,
  invoiceNumber,
  invoiceSequenceKey,
  invoiceYear,
  paymentStatusLabel,
  type InvoiceLine,
  type InvoiceSubject,
} from '@/lib/invoice-content';
import { REGULATORY_STATEMENT } from '@/lib/catalog';

const line = (over: Partial<InvoiceLine> = {}): InvoiceLine => ({
  sku: 'NPL-001-5MG',
  productCode: 'NPL-001',
  productName: 'BPC-157',
  packSize: '5 mg',
  presentation: 'Lyophilised powder',
  quantity: 2,
  unitPriceCents: 12500,
  lineTotalCents: 25000,
  lotNumber: 'NPL1-TEST-REL',
  ...over,
});

const subject = (
  order: Partial<InvoiceSubject['order']> = {},
  lines: InvoiceLine[] = [line()],
  organization: InvoiceSubject['organization'] = {
    legalName: 'Example University',
    addressLine1: 'Department of Chemistry',
    addressLine2: null,
    city: 'Cambridge',
    region: 'MA',
    postalCode: '02139',
    country: 'United States',
  },
): InvoiceSubject => ({
  order: {
    orderNumber: 'NPL-1042',
    status: 'paid',
    currency: 'USD',
    subtotalCents: 25000,
    shippingCents: 2500,
    taxCents: 0,
    totalCents: 27500,
    paymentMethod: 'invoice',
    paymentRef: 'WIRE-9931',
    paymentStatus: 'paid',
    submittedAt: new Date('2026-09-01T00:00:00Z'),
    paidAt: new Date('2026-09-03T00:00:00Z'),
    consigneeName: 'Dr Ada Lovelace',
    consigneeInstitution: 'Example University',
    shipToLine1: '77 Massachusetts Ave',
    shipToLine2: 'Building 4',
    shipToCity: 'Cambridge',
    shipToRegion: 'MA',
    shipToPostalCode: '02139',
    shipToCountry: 'United States',
    customerNote: null,
    ...order,
  },
  organization,
  lines,
});

describe('invoiceBlockers', () => {
  it('passes an order whose figures reconcile', () => {
    expect(invoiceBlockers(subject())).toEqual([]);
  });

  it('refuses an order with no lines', () => {
    expect(
      invoiceBlockers(subject({ subtotalCents: 0, totalCents: 2500 }, [])),
    ).toContain('This order has no lines.');
  });

  it('refuses a cancelled order', () => {
    expect(
      invoiceBlockers(subject({ status: 'cancelled' })).some((b) =>
        b.includes('cancelled'),
      ),
    ).toBe(true);
  });

  it('catches a line that does not multiply out', () => {
    const blockers = invoiceBlockers(
      subject({}, [line({ lineTotalCents: 24000 })]),
    );
    // The subtotal mismatch is reported too; the line error must be there.
    expect(blockers.some((b) => b.includes('does not add up'))).toBe(true);
  });

  it('catches lines that do not sum to the recorded subtotal', () => {
    const blockers = invoiceBlockers(
      subject({ subtotalCents: 20000, totalCents: 22500 }),
    );
    expect(
      blockers.some((b) => b.includes('but the order subtotal recorded is')),
    ).toBe(true);
  });

  it('catches a total that does not include shipping', () => {
    const blockers = invoiceBlockers(subject({ totalCents: 25000 }));
    expect(
      blockers.some((b) => b.includes('but the order total recorded is')),
    ).toBe(true);
  });

  it('refuses a line with a non-positive quantity', () => {
    const blockers = invoiceBlockers(
      subject({ subtotalCents: 0, totalCents: 2500 }, [
        line({ quantity: 0, lineTotalCents: 0 }),
      ]),
    );
    expect(blockers.some((b) => b.includes('quantity of 0'))).toBe(true);
  });

  it('states the amounts in the mismatch so it can be reconciled', () => {
    const blockers = invoiceBlockers(
      subject({}, [line({ lineTotalCents: 24000 })]),
    );
    const message = blockers.find((b) => b.includes('does not add up'))!;
    expect(message).toContain('250.00');
    expect(message).toContain('240.00');
  });
});

describe('buildInvoiceContent', () => {
  it('bills the verified organisation, not the person the parcel is addressed to', () => {
    const content = buildInvoiceContent(subject());
    expect(content.billTo[0]).toBe('Example University');
    expect(content.billTo).toContain('Cambridge, MA, 02139');
    expect(content.shipTo[0]).toBe('Dr Ada Lovelace');
  });

  it('falls back to the consignee when there is no organisation', () => {
    const content = buildInvoiceContent(subject({}, [line()], null));
    expect(content.billTo).toEqual(['Example University', 'Dr Ada Lovelace']);
  });

  it('drops empty address lines rather than printing blanks', () => {
    const content = buildInvoiceContent(
      subject({ shipToLine2: null }, [line()], {
        legalName: 'Lab Ltd',
        addressLine1: null,
        addressLine2: null,
        city: null,
        region: null,
        postalCode: null,
        country: null,
      }),
    );
    expect(content.billTo).toEqual(['Lab Ltd']);
    expect(content.shipTo).not.toContain('');
  });

  it('omits a shipping line when there is no shipping charge', () => {
    const content = buildInvoiceContent(
      subject({ shippingCents: 0, totalCents: 25000 }),
    );
    expect(content.totals.map(([label]) => label)).toEqual([
      'Subtotal',
      'Total USD',
    ]);
  });

  it('shows shipping when it is charged', () => {
    const content = buildInvoiceContent(subject());
    expect(content.totals).toEqual([
      ['Subtotal', '250.00'],
      ['Shipping', '25.00'],
      ['Total USD', '275.00'],
    ]);
  });

  it('shows tax and reconciles it into the accepted total', () => {
    const content = buildInvoiceContent(
      subject({ taxCents: 2063, totalCents: 29563 }),
    );
    expect(content.totals).toEqual([
      ['Subtotal', '250.00'],
      ['Shipping', '25.00'],
      ['Tax', '20.63'],
      ['Total USD', '295.63'],
    ]);
  });

  it('says nothing is due once the order is paid', () => {
    expect(buildInvoiceContent(subject()).paymentNote).toContain(
      'no payment is due',
    );
  });

  it('asks for payment when the order is not paid', () => {
    const content = buildInvoiceContent(subject({ paymentStatus: 'unpaid' }));
    expect(content.paymentNote).toContain('due on receipt');
  });

  it('carries the lot number on the line so the invoice reconciles to the parcel', () => {
    const content = buildInvoiceContent(subject());
    expect(content.rows[0].detail).toContain('Lot NPL1-TEST-REL');
    expect(content.rows[0].detail).toContain('NPL-001-5MG');
  });

  it('leaves the lot off a line that has not been fulfilled', () => {
    const content = buildInvoiceContent(
      subject({}, [line({ lotNumber: null })]),
    );
    expect(content.rows[0].detail).not.toContain('Lot');
  });

  it('carries the conditions of supply', () => {
    expect(buildInvoiceContent(subject()).statement).toBe(REGULATORY_STATEMENT);
  });

  it('includes a customer note only when there is one', () => {
    expect(buildInvoiceContent(subject()).customerNote).toBeNull();
    expect(
      buildInvoiceContent(
        subject({ customerNote: '  Deliver to the loading bay ' }),
      ).customerNote,
    ).toBe('Deliver to the loading bay');
  });
});

describe('numbering', () => {
  it('pads the sequence and carries the year', () => {
    expect(invoiceNumber(2026, 1)).toBe('INV-2026-0001');
    expect(invoiceNumber(2026, 1234)).toBe('INV-2026-1234');
  });

  it('does not truncate past four digits', () => {
    expect(invoiceNumber(2026, 12345)).toBe('INV-2026-12345');
  });

  it('keys the series by year', () => {
    expect(invoiceSequenceKey(2026)).toBe('invoice:2026');
  });

  it('reads the year in UTC so the series does not straddle a local new year', () => {
    // 31 December 23:30 UTC is still 2026 everywhere the series is read.
    expect(invoiceYear(new Date('2026-12-31T23:30:00Z'))).toBe(2026);
    expect(invoiceYear(new Date('2027-01-01T00:30:00Z'))).toBe(2027);
  });
});

describe('paymentStatusLabel', () => {
  it('humanises every status the order machine can hold', () => {
    expect(paymentStatusLabel('refund_due')).toBe('Refund due');
    expect(paymentStatusLabel('paid')).toBe('Paid');
    expect(paymentStatusLabel('something_new')).toBe('something new');
  });
});
