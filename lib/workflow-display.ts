/** Presentation only: never grants access or changes an order's state. */
export const ORDER_QUEUES = {
  all: 'All orders',
  submitted: 'Choose payment',
  awaiting_payment: 'Awaiting payment',
  paid: 'Ready to prepare',
  fulfilling: 'Being prepared',
  shipped: 'Shipped',
  refund_due: 'Refunds due',
  cancelled: 'Cancelled',
} as const;
export type OrderQueue = keyof typeof ORDER_QUEUES;
export function orderQueue(value?: string): OrderQueue {
  return value && Object.hasOwn(ORDER_QUEUES, value)
    ? (value as OrderQueue)
    : 'all';
}
export function matchesOrderQueue(
  order: { status: string; paymentStatus: string },
  queue: OrderQueue,
): boolean {
  return (
    queue === 'all' ||
    (queue === 'refund_due'
      ? order.paymentStatus === 'refund_due'
      : order.status === queue)
  );
}
export function orderNextStep(
  order: { status: string; paymentStatus: string },
  staff = false,
): string {
  if (order.paymentStatus === 'refund_due')
    return staff
      ? 'Record the remaining refund after it has been sent.'
      : 'Our team needs to complete your refund. No further payment is needed.';
  if (order.status === 'cancelled')
    return 'This order is closed. Contact support if you need help.';
  switch (order.status) {
    case 'submitted':
      return staff
        ? 'Customer chooses a payment method. Help if they cannot continue.'
        : 'Choose a payment method below to get instructions.';
    case 'awaiting_payment':
      return staff
        ? 'Await confirmed payment before preparing material.'
        : 'Follow the payment instructions below. Preparation begins after payment is confirmed.';
    case 'paid':
      return staff
        ? 'Select eligible released lots and begin preparation.'
        : 'Payment is confirmed. Our team will prepare your order next.';
    case 'fulfilling':
      return staff
        ? 'Complete packing checks and record the carrier and tracking number.'
        : 'Your order is being prepared. Tracking appears here when it ships.';
    case 'shipped':
      return staff
        ? 'Check tracking and respond to any delivery or document questions.'
        : 'Track your shipment and open the lot records below for available documents.';
    default:
      return 'Contact support to confirm the next step.';
  }
}
type SearchableMaterial = {
  name: string;
  code: string;
  casNumber: string;
  synonyms: string[];
};
export function searchQuery(raw: unknown): string {
  return typeof raw === 'string' ? raw.trim().slice(0, 120) : '';
}
export function searchMaterials<T extends SearchableMaterial>(
  products: T[],
  query: string,
): T[] {
  const terms = query
    .trim()
    .toLocaleLowerCase('en-US')
    .split(/\s+/)
    .filter(Boolean);
  return products.filter((p) => {
    const haystack = [p.name, p.code, p.casNumber, ...p.synonyms]
      .join(' ')
      .toLocaleLowerCase('en-US');
    return terms.every((term) => haystack.includes(term));
  });
}
