/**
 * How a notification category reads in the email and where staff go to see its record.
 *
 * Every notification keeps its record's reference in `order_number`: an NX- order
 * number for order messages, the conversation's FB- id for website feedback, and the
 * product code for back-in-stock notices. Feedback rows used to link to
 * /manage/orders/FB-…, which does not exist.
 */
export type NotificationPresentation = {
  /** The label printed before the link at the foot of the email. */
  actionLabel: string;
  /** Which sender identity signs it (lib/email sender purposes). */
  purpose: 'orders' | 'support';
};

export function notificationPresentation(category: string): NotificationPresentation {
  switch (category) {
    case 'feedback':
      return { actionLabel: 'Feedback record', purpose: 'support' };
    case 'waitlist':
      return { actionLabel: 'Material page', purpose: 'orders' };
    default:
      return { actionLabel: 'Order details', purpose: 'orders' };
  }
}

export function notificationRecordHref(category: string, reference: string): string {
  const ref = encodeURIComponent(reference);
  if (category === 'feedback') return `/manage/feedback/${ref}`;
  if (category === 'waitlist') return `/manage/waitlist?product=${ref}`;
  return `/manage/orders/${ref}`;
}
