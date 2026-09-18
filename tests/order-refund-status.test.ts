import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { OrderRefundStatus } from '@/components/site/order-refund-status';

const render = (props: React.ComponentProps<typeof OrderRefundStatus>) =>
  renderToStaticMarkup(React.createElement(OrderRefundStatus, props));

const base = {
  refundDueCents: 4500,
  totalCents: 9000,
  refundedAt: new Date('2026-09-16T00:00:00.000Z'),
};

describe('order refund status', () => {
  it('says that no refund has been sent when the due amount is untouched', () => {
    const html = render({
      ...base,
      paymentStatus: 'refund_due',
      refundCents: 0,
    });
    expect(html).toContain('No refund has been sent yet.');
    expect(html).toContain('Remaining amount of $45.00 awaits a manual refund.');
    expect(html).not.toContain('being processed');
  });

  it('shows the sent and remaining amounts for a partial refund', () => {
    const html = render({
      ...base,
      paymentStatus: 'refund_due',
      refundCents: 2000,
    });
    expect(html).toContain('Refund: $20.00 sent');
    expect(html).toContain('remaining amount of $25.00 awaits a manual refund.');
  });

  it('shows a completed refund when the recorded amount reaches the due amount', () => {
    const html = render({
      ...base,
      paymentStatus: 'refunded',
      refundCents: 4500,
    });
    expect(html).toContain('Refund: $45.00 sent');
    expect(html).toContain('refund complete.');
    expect(html).not.toContain('awaits a manual refund');
  });

  it('does not render anything for a non-refund order', () => {
    expect(
      render({
        ...base,
        paymentStatus: 'paid',
        refundCents: 0,
      }),
    ).toBe('');
  });
});