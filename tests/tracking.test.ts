import { describe, expect, it } from 'vitest';
import { trackingUrl } from '@/lib/tracking';

describe('trackingUrl', () => {
  it('builds links for known carriers and none otherwise', () => {
    expect(trackingUrl('UPS', '1Z999')).toBe('https://www.ups.com/track?tracknum=1Z999');
    expect(trackingUrl('FedEx Priority', '123456789012')).toContain('fedex.com');
    expect(trackingUrl('USPS', '9400111899223')).toContain('usps.com');
    expect(trackingUrl('DHL Express', 'JD0123')).toContain('dhl.com');
    expect(trackingUrl('Courier', 'ABC')).toBeNull();
    expect(trackingUrl('UPS', null)).toBeNull();
    expect(trackingUrl('UPS', '<script>')).toBeNull();
  });
});
