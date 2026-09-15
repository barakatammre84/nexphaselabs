import type { ZelleMode } from '@/lib/zelle-config';

export type ManualPaymentDecision = { allowed: true } | { allowed: false; reason: string };

/**
 * Whether staff may record an order's payment by hand ("Mark paid").
 *
 * A rail with its own settlement check records the payment itself, and a person
 * must not be able to skip that check: BTCPay marks an order paid when its invoice
 * settles, and Zelle outside manual mode matches a bank receipt to the order on
 * the Zelle desk. Every other rail (bank transfer, invoice, Zelle in manual mode)
 * is reconciled by a person, which is what the button is for.
 */
export function manualPaymentRecording(paymentMethod: string | null, mode: ZelleMode): ManualPaymentDecision {
  if (paymentMethod === 'btcpay') {
    return {
      allowed: false,
      reason:
        'Bitcoin payments are recorded automatically when the BTCPay invoice settles. If it settled and this order did not move, reconcile the payment from Readiness.',
    };
  }
  if (paymentMethod === 'zelle' && mode !== 'manual' && mode !== 'disabled') {
    return {
      allowed: false,
      reason: 'Zelle payments are recorded from the Zelle desk in this mode, where the bank receipt is matched to the order.',
    };
  }
  return { allowed: true };
}
