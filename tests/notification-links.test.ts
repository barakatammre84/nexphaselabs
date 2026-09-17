import { describe, expect, it } from 'vitest';
import { notificationPresentation, notificationRecordHref } from '@/lib/notification-links';

describe('notification record links', () => {
  it('sends an order message to its order', () => {
    expect(notificationRecordHref('order', 'NX-260914-0001')).toBe('/manage/orders/NX-260914-0001');
  });

  it('sends a website-feedback message to its conversation instead of a missing order', () => {
    expect(notificationRecordHref('feedback', 'FB-7Q2KX9')).toBe('/manage/feedback/FB-7Q2KX9');
  });

  it('sends a back-in-stock notice to the waitlist desk for that material', () => {
    expect(notificationRecordHref('waitlist', 'NPL-0001')).toBe('/manage/waitlist?product=NPL-0001');
  });

  it('labels and signs each category for the email', () => {
    expect(notificationPresentation('order')).toEqual({ actionLabel: 'Order details', purpose: 'orders' });
    expect(notificationPresentation('feedback')).toEqual({ actionLabel: 'Feedback record', purpose: 'support' });
    expect(notificationPresentation('waitlist')).toEqual({ actionLabel: 'Material page', purpose: 'orders' });
  });
});
