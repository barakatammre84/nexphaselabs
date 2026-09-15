import { describe, expect, it } from 'vitest';
import { notificationRecordHref } from '@/lib/notification-links';

describe('notification record links', () => {
  it('sends an order message to its order', () => {
    expect(notificationRecordHref('order', 'NX-260914-0001')).toBe('/manage/orders/NX-260914-0001');
  });

  it('sends a website-feedback message to its conversation instead of a missing order', () => {
    expect(notificationRecordHref('feedback', 'FB-7Q2KX9')).toBe('/manage/feedback/FB-7Q2KX9');
  });
});
