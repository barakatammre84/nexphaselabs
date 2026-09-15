import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
vi.stubGlobal('React', React);
import { OrderShippingDesk } from '@/components/manage/order-shipping-desk';

type Props = Parameters<typeof OrderShippingDesk>[0];
type Label = NonNullable<Props['initialLabel']>;

const label = (overrides: Partial<Label> = {}): Label => ({
  id: 'lbl_1',
  state: 'ready',
  originLabel: 'Oakland',
  carrier: 'USPS',
  serviceName: 'Priority Mail',
  amountCents: 950,
  trackingNumber: '9400100000000000000000',
  labelUrl: 'https://labels.example.invalid/lbl_1.pdf',
  test: false,
  error: null,
  refundState: null,
  refundRef: null,
  refundReason: null,
  createdAt: '2026-09-15T00:00:00.000Z',
  refundRequestedAt: null,
  refundRequestedBy: null,
  ...overrides,
});

const render = (initialLabel: Label) =>
  renderToStaticMarkup(
    React.createElement(OrderShippingDesk, {
      orderNumber: 'NX-260915-0001',
      parcel: null,
      initialLabel,
      initialHistory: [],
      origins: [],
    }),
  );

describe('shipping desk label link', () => {
  it('opens a purchased label file', () => {
    const html = render(label());
    expect(html).toContain('href="https://labels.example.invalid/lbl_1.pdf"');
    expect(html).toContain('Open label');
  });

  it('opens a test label through the staff label route', () => {
    expect(render(label({ test: true }))).toContain('href="/api/manage/orders/NX-260915-0001/shipping/label-pdf"');
  });

  it('offers no link when there is no file, instead of one to "#"', () => {
    const live = render(label({ labelUrl: null }));
    expect(live).not.toContain('Open label');
    expect(live).not.toContain('href="#"');
    expect(live).toContain('The carrier returned no label file');
    expect(render(label({ test: true, labelUrl: null }))).toContain('This test label has no file to print.');
  });
});
