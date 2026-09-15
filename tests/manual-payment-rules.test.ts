import { describe, expect, it } from 'vitest';
import { manualPaymentRecording } from '@/lib/manual-payment-rules';

describe('recording a payment by hand', () => {
  it('is allowed for rails a person reconciles', () => {
    expect(manualPaymentRecording('bank_transfer', 'automatic')).toEqual({ allowed: true });
    expect(manualPaymentRecording('invoice', 'supervised')).toEqual({ allowed: true });
    expect(manualPaymentRecording('zelle', 'manual')).toEqual({ allowed: true });
    expect(manualPaymentRecording('zelle', 'disabled')).toEqual({ allowed: true });
    expect(manualPaymentRecording(null, 'manual')).toEqual({ allowed: true });
  });

  it('is refused where a settlement check records the payment itself', () => {
    expect(manualPaymentRecording('btcpay', 'manual').allowed).toBe(false);
    for (const mode of ['shadow', 'supervised', 'automatic'] as const) {
      expect(manualPaymentRecording('zelle', mode).allowed, mode).toBe(false);
    }
  });
});
