import { env } from 'cloudflare:workers';
import type { Order } from '@/db/schema';
import { publicOrigin, openCheckoutEnabled } from '@/lib/site-config';
import { livePaymentsAllowed } from '@/lib/environment-safety';
import { boundedJson } from '@/lib/provider-response';

/**
 * Payment methods behind one interface.
 *
 * Card processors (Stripe, PayPal, Square) prohibit this category, so the
 * rails are bank transfer and self-hosted Bitcoin (BTCPay Server). Which of
 * them is live is configuration, not code:
 *
 *   PAYMENT_BANK_INSTRUCTIONS  remittance text shown for bank transfer / ACH
 *   BTCPAY_HOST, BTCPAY_STORE_ID, BTCPAY_API_KEY, BTCPAY_WEBHOOK_SECRET
 *
 * With nothing configured, an order still moves to awaiting payment and the
 * customer is told instructions will follow by email; a staff member records
 * the payment by hand. That keeps ordering usable while the provider
 * decision is open.
 */

export type PaymentMethodId = 'bank_transfer' | 'btcpay' | 'invoice';

export type PaymentInstructions = {
  method: PaymentMethodId;
  title: string;
  /** Plain-text lines shown to the customer and put in the email. */
  lines: string[];
  /** External checkout link, when the provider issues one. */
  url: string | null;
  /** Provider reference (invoice id), when one exists. */
  reference: string | null;
};

export type PaymentMethod = {
  id: PaymentMethodId;
  label: string;
  description: string;
  enabled: () => boolean;
  /** Prepare instructions (and create a provider invoice if applicable). */
  begin: (order: Order, attemptId?: string) => Promise<PaymentInstructions>;
};

const bankTransfer: PaymentMethod = {
  id: 'bank_transfer',
  label: 'Bank transfer (ACH or wire)',
  description:
    'Pay from your organisation’s bank account. Quote the order number as the reference.',
  enabled: () =>
    livePaymentsAllowed(env.APP_ENV) &&
    Boolean(env.PAYMENT_BANK_INSTRUCTIONS?.trim()),
  async begin(order) {
    return {
      method: 'bank_transfer',
      title: 'Bank transfer',
      lines: [
        `Amount: ${(order.totalCents / 100).toFixed(2)} ${order.currency}`,
        `Reference: ${order.orderNumber}`,
        ...String(env.PAYMENT_BANK_INSTRUCTIONS ?? '')
          .split(/\r?\n/)
          .map((l) => l.trim())
          .filter(Boolean),
        'Material is picked and shipped once the transfer has cleared.',
      ],
      url: null,
      reference: order.orderNumber,
    };
  },
};

const btcpay: PaymentMethod = {
  id: 'btcpay',
  label: 'Bitcoin (BTCPay Server)',
  description:
    'Pay in Bitcoin through our self-hosted BTCPay Server. The invoice is priced in USD at the time of payment.',
  enabled: () =>
    livePaymentsAllowed(env.APP_ENV) &&
    Boolean(
      env.BTCPAY_HOST &&
      env.BTCPAY_STORE_ID &&
      env.BTCPAY_API_KEY &&
      env.BTCPAY_WEBHOOK_SECRET,
    ),
  async begin(order, attemptId) {
    if (!livePaymentsAllowed(env.APP_ENV))
      throw new Error('Live payments are disabled outside production.');
    const host = String(env.BTCPAY_HOST).replace(/\/$/, '');
    const response = await fetch(
      `${host}/api/v1/stores/${env.BTCPAY_STORE_ID}/invoices`,
      {
        method: 'POST',
        signal: AbortSignal.timeout(10_000),
        headers: {
          Authorization: `token ${env.BTCPAY_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          amount: (order.totalCents / 100).toFixed(2),
          currency: order.currency,
          metadata: {
            orderId: order.orderNumber,
            orderNumber: order.orderNumber,
            paymentAttemptId: attemptId,
          },
          checkout: {
            redirectURL: `${publicOrigin()}/account/orders/${order.orderNumber}?paid=pending`,
          },
        }),
      },
    );
    if (!response.ok) {
      console.error('[payments] btcpay invoice failed', response.status);
      throw new Error('BTCPay invoice could not be created.');
    }
    const invoice = (await boundedJson(response)) as {
      id: string;
      checkoutLink: string;
    };
    return {
      method: 'btcpay',
      title: 'Bitcoin invoice',
      lines: [
        `Amount: ${(order.totalCents / 100).toFixed(2)} ${order.currency}`,
        `Invoice: ${invoice.id}`,
        'Open the invoice link to pay. The order is marked paid automatically once the payment settles.',
      ],
      url: btcpayCheckoutUrl(invoice.id),
      reference: invoice.id,
    };
  },
};

/** Fallback when no rail is configured: instructions follow by email, payment is recorded by staff. */
const invoice: PaymentMethod = {
  id: 'invoice',
  label: 'Invoice',
  description:
    'We send payment instructions by email and record the payment when it arrives.',
  enabled: () => true,
  async begin(order) {
    return {
      method: 'invoice',
      title: 'Invoice to follow',
      lines: [
        `Amount: ${(order.totalCents / 100).toFixed(2)} ${order.currency}`,
        `Reference: ${order.orderNumber}`,
        'Payment instructions will be emailed to you. Material ships once payment is recorded.',
      ],
      url: null,
      reference: order.orderNumber,
    };
  },
};

const METHODS: PaymentMethod[] = [bankTransfer, btcpay, invoice];

const testInvoice: PaymentMethod = {
  id: 'invoice',
  label: 'Simulated payment — no money moves',
  description:
    'Test environment only. Complete a simulated payment on the next screen; no money moves.',
  enabled: () => true,
  async begin(order) {
    return {
      method: 'invoice',
      title: 'TEST — do not send payment',
      lines: [
        `Test order: ${order.orderNumber}`,
        'No invoice is created with a payment provider. No bank transfer is required.',
      ],
      url: null,
      reference: `TEST-${order.orderNumber}`,
    };
  },
};

/** BTCPay's checkout page for an invoice, rebuilt from configuration so it never depends on the email. */
export function btcpayCheckoutUrl(invoiceId: string): string | null {
  if (
    !livePaymentsAllowed(env.APP_ENV) ||
    !env.BTCPAY_HOST ||
    !/^[A-Za-z0-9]{6,64}$/.test(invoiceId)
  )
    return null;
  return `${String(env.BTCPAY_HOST).replace(/\/$/, '')}/i/${invoiceId}`;
}

/** Best effort: request invalidation on cancellation. This does not guarantee
 * that money cannot arrive; settlement handling must still account for it. */
export async function invalidateBtcpayInvoice(
  invoiceId: string,
): Promise<void> {
  if (!btcpay.enabled() || !/^[A-Za-z0-9]{6,64}$/.test(invoiceId)) return;
  try {
    const host = String(env.BTCPAY_HOST).replace(/\/$/, '');
    const response = await fetch(
      `${host}/api/v1/stores/${env.BTCPAY_STORE_ID}/invoices/${invoiceId}/status`,
      {
        method: 'POST',
        signal: AbortSignal.timeout(10_000),
        headers: {
          Authorization: `token ${env.BTCPAY_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ status: 'Invalid' }),
      },
    );
    if (!response.ok)
      console.error('[payments] btcpay invalidate failed', response.status);
  } catch (error) {
    console.error(
      '[payments] btcpay invalidate error',
      error instanceof Error ? error.message : error,
    );
  }
}

/** Methods a customer may choose right now. 'invoice' is offered only when no real rail is configured. */
export function availablePaymentMethods(): PaymentMethod[] {
  if (!livePaymentsAllowed(env.APP_ENV)) return [testInvoice];
  const real = METHODS.filter((m) => m.id !== 'invoice' && m.enabled());
  return real.length ? real : [invoice];
}

export function getPaymentMethod(id: string): PaymentMethod | null {
  return availablePaymentMethods().find((m) => m.id === id) ?? null;
}

/**
 * Which rails are live in this environment, and what each one is still waiting
 * for (chapter 11 c11-rails: "turn on bank transfer and BTCPay before the domain
 * moves, so the site is a catalogue people can actually buy from rather than
 * literally zero").
 *
 * Reports presence only. No secret value is ever read into the result, so this
 * is safe to render on a staff screen.
 */
export type PaymentRailStatus = {
  id: PaymentMethodId;
  label: string;
  live: boolean;
  missing: string[];
  note?: string;
};

export function paymentRailStatus(): PaymentRailStatus[] {
  const set = (name: keyof Cloudflare.Env) => Boolean(String(env[name] ?? '').trim());
  const production = livePaymentsAllowed(env.APP_ENV);
  const environmentNote = production
    ? undefined
    : `Not production (APP_ENV=${env.APP_ENV ?? 'unset'}), so every rail stays simulated whatever is configured.`;
  return [
    {
      id: 'bank_transfer',
      label: bankTransfer.label,
      live: bankTransfer.enabled(),
      missing: set('PAYMENT_BANK_INSTRUCTIONS') ? [] : ['PAYMENT_BANK_INSTRUCTIONS'],
      note: environmentNote,
    },
    {
      id: 'btcpay',
      label: btcpay.label,
      live: btcpay.enabled(),
      missing: (['BTCPAY_HOST', 'BTCPAY_STORE_ID', 'BTCPAY_API_KEY', 'BTCPAY_WEBHOOK_SECRET'] as const).filter(
        (name) => !set(name),
      ),
      note: environmentNote,
    },
    {
      id: 'invoice',
      label: invoice.label,
      live: true,
      missing: [],
      note: 'Always available. An order still reaches awaiting-payment and a staff member records the payment by hand.',
    },
  ];
}

export async function lookupBtcpayInvoice(reference: string, order: Order, attemptId: string): Promise<boolean> {
  if (!btcpay.enabled() || !/^[A-Za-z0-9]{6,64}$/.test(reference)) return false;
  const host = String(env.BTCPAY_HOST).replace(/\/$/, '');
  const response = await fetch(`${host}/api/v1/stores/${env.BTCPAY_STORE_ID}/invoices/${reference}`, {
    headers: { Authorization: `token ${env.BTCPAY_API_KEY}` }, signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) return false;
  const data = await boundedJson(response) as { id?: string; amount?: string; currency?: string; metadata?: { orderId?: string; paymentAttemptId?: string } };
  return data.id === reference && data.currency === order.currency && typeof data.amount === 'string'
    && /^\d+(?:\.\d{1,2})?$/.test(data.amount) && Math.round(Number(data.amount) * 100) === order.totalCents
    && data.metadata?.orderId === order.orderNumber && data.metadata?.paymentAttemptId === attemptId;
}

export {
  parseBtcpayEvent,
  verifyBtcpaySignature,
  type BtcpayEvent,
} from '@/lib/payments-core';

/** Explicitly allowlisted environments; missing or unknown configuration must fail closed. */
export function buyerSimulationEnabled(): boolean {
  return (
    openCheckoutEnabled() &&
    (env.APP_ENV === 'staging' || env.APP_ENV === 'development')
  );
}
