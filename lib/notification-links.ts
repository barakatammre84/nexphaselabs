/**
 * The staff page a notification belongs to. Every notification keeps its record's
 * reference in `order_number`: an NX- order number for order messages, the
 * conversation's FB- id for website feedback. Feedback rows used to link to
 * /manage/orders/FB-…, which does not exist.
 */
export function notificationRecordHref(category: string, reference: string): string {
  return category === 'feedback'
    ? `/manage/feedback/${encodeURIComponent(reference)}`
    : `/manage/orders/${encodeURIComponent(reference)}`;
}
