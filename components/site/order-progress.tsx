import { Check, CircleX } from 'lucide-react';

const steps = ['Order placed', 'Payment', 'Preparing', 'Shipped', 'Delivered'] as const;

export function OrderProgress({
  status,
  delivered = false,
}: {
  status: string;
  delivered?: boolean;
}) {
  if (status === 'cancelled') {
    return (
      <div className="mt-6 flex items-center gap-3 border border-destructive/30 bg-secondary p-4 text-sm">
        <CircleX className="size-5 text-destructive" />
        <span>
          <strong>Order cancelled.</strong> Refund details appear below when
          payment had already been received.
        </span>
      </div>
    );
  }
  const active = delivered
    ? 4
    : status === 'submitted' || status === 'awaiting_payment'
      ? 1
      : status === 'paid' || status === 'fulfilling'
        ? 2
        : status === 'shipped'
          ? 3
          : 0;
  return (
    <ol aria-label="Order progress" className="checkout-progress mt-7">
      {steps.map((step, index) => (
        <li
          key={step}
          className={index <= active ? 'is-current' : ''}
          aria-current={index === active ? 'step' : undefined}
        >
          <span>
            {index < active || delivered ? (
              <Check className="size-3.5" />
            ) : (
              index + 1
            )}
          </span>
          {step}
        </li>
      ))}
    </ol>
  );
}
