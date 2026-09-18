import { refundDue } from '@/lib/order-rules';
import { formatCents } from '@/lib/visibility-rules';

type OrderRefundStatusProps = {
  paymentStatus: string;
  refundDueCents: number | null;
  refundCents: number | null;
  totalCents: number;
  refundedAt: Date | null;
};

/** Explains the recorded refund, without suggesting that this system moves money. */
export function OrderRefundStatus({
  paymentStatus,
  refundDueCents,
  refundCents,
  totalCents,
  refundedAt,
}: OrderRefundStatusProps) {
  if (paymentStatus !== 'refund_due' && paymentStatus !== 'refunded') return null;

  const due = refundDue({ refundDueCents, totalCents });
  const sent = Math.max(0, refundCents ?? 0);
  const remaining = Math.max(0, due - sent);
  const date = refundedAt
    ? ` (first on ${refundedAt.toISOString().slice(0, 10)})`
    : '';

  if (sent === 0 && remaining > 0) {
    return (
      <p className="mt-2 text-sm text-muted-foreground">
        No refund has been sent yet. Remaining amount of {formatCents(remaining)}{' '}
        awaits a manual refund.
      </p>
    );
  }

  return (
    <p className="mt-2 text-sm text-muted-foreground">
      Refund: {formatCents(sent)} sent{date}
      {remaining > 0
        ? ` — remaining amount of ${formatCents(remaining)} awaits a manual refund.`
        : ' — refund complete.'}
    </p>
  );
}