import type { DatabaseSync } from 'node:sqlite';
import { env } from 'cloudflare:workers';
import { getDb } from '@/db';
import { staffUsers } from '@/db/schema';
import { beginPayment, getOrderByNumber, recordRefund } from '@/lib/orders';
import type { ZelleGmailMessage } from '@/lib/zelle-core';
import {
  seedCommerceFixture,
  syntheticBuyer,
  syntheticOrder,
} from './commerce-fixture';

export const REHEARSAL_STAFF = {
  id: 'bank_rehearsal_admin',
  email: 'bank-rehearsal-admin@example.invalid',
  name: 'Synthetic bank rehearsal admin',
  passwordHash: 'disabled',
  role: 'admin' as const,
};

export async function seedBankPaymentRehearsal() {
  await seedCommerceFixture();
  await getDb().insert(staffUsers).values(REHEARSAL_STAFF);
}

export async function submittedRehearsalOrder(packs = 1) {
  // Production checkout also requires a carrier quote. This payment rehearsal
  // deliberately creates its local order under the safe non-live checkout
  // configuration, then restores production before exercising a live adapter.
  const previous = env.APP_ENV;
  env.APP_ENV = 'staging';
  try {
    return await syntheticOrder(packs);
  } finally {
    env.APP_ENV = previous;
  }
}

export async function awaitingRehearsalOrder(
  method: 'bank_transfer' | 'zelle',
  packs = 1,
) {
  const created = await submittedRehearsalOrder(packs);
  const started = await beginPayment(
    created.detail,
    method,
    created.buyer.email ?? 'buyer@example.invalid',
    `${created.buyer.name} (${created.buyer.id})`,
  );
  if (!started.ok) throw new Error(started.error);
  const detail = await getOrderByNumber(created.detail.order.orderNumber);
  if (!detail) throw new Error('Rehearsal order disappeared after payment setup.');
  return { ...created, detail, instructions: started.instructions };
}

export function syntheticZelleReceipt(
  orderNumber: string,
  id: string,
  amount = '1.00',
  memo = orderNumber,
): ZelleGmailMessage {
  return {
    id,
    threadId: `thread-${id}`,
    internalDate: String(Date.UTC(2026, 8, 18, 19, 30)),
    headers: [
      { name: 'From', value: 'Synthetic Bank <alerts@bank.invalid>' },
      { name: 'To', value: 'payments@example.invalid' },
      { name: 'Subject', value: 'You received money with Zelle' },
      {
        name: 'Authentication-Results',
        value:
          'mx.google.com; dkim=pass header.i=@bank.invalid; spf=pass; dmarc=pass header.from=bank.invalid',
      },
    ],
    text: `You received $${amount} with Zelle from Synthetic Buyer.\nMemo: ${memo}`,
  };
}

export function bankLedger(sqlite: DatabaseSync, orderId: string) {
  const scalar = (query: string, ...values: (string | number)[]) =>
    Number(
      (
        sqlite.prepare(query).get(...values) as
          | { n: number | bigint }
          | undefined
      )?.n ?? 0,
    );
  const order = sqlite
    .prepare(
      `SELECT status, payment_status AS paymentStatus, total_cents AS totalCents,
              refund_due_cents AS refundDueCents, refund_cents AS refundCents,
              refund_ref AS refundRef,
              payment_method AS paymentMethod, payment_ref AS paymentRef
         FROM orders WHERE id = ?`,
    )
    .get(orderId) as Record<string, unknown>;
  return {
    order,
    attempts: scalar(
      'SELECT count(*) AS n FROM payment_attempts WHERE order_id = ?',
      orderId,
    ),
    events: scalar(
      'SELECT count(*) AS n FROM order_events WHERE order_id = ?',
      orderId,
    ),
    reservations: scalar(
      'SELECT count(*) AS n FROM inventory_reservations WHERE order_id = ?',
      orderId,
    ),
    reservedUnits: scalar(
      'SELECT COALESCE(sum(units), 0) AS n FROM inventory_reservations WHERE order_id = ?',
      orderId,
    ),
    receipts: scalar(
      'SELECT count(*) AS n FROM zelle_receipts WHERE order_id = ?',
      orderId,
    ),
    notifications: scalar(
      `SELECT count(*) AS n FROM notifications
        WHERE order_number = (SELECT order_number FROM orders WHERE id = ?)`,
      orderId,
    ),
    lotRemaining: String(
      (
        sqlite
          .prepare("SELECT quantity_remaining AS value FROM lots WHERE id = 'l'")
          .get() as { value: string }
      ).value,
    ),
  };
}

/** Drives the same guarded cumulative refund API a staff/browser harness invokes. */
export async function rehearseRefund(
  orderNumber: string,
  amountCents: number,
  reference: string,
) {
  const detail = await getOrderByNumber(orderNumber);
  if (!detail) throw new Error('Unknown rehearsal order.');
  return recordRefund(detail, amountCents, reference, REHEARSAL_STAFF.name);
}

/** Creates a competing buyer without sharing cookies, accounts, or real identities. */
export async function competingRehearsalBuyer(packs = 1) {
  const buyer = await syntheticBuyer(packs);
  return {
    ...buyer,
    submit: async () => {
      const previous = env.APP_ENV;
      env.APP_ENV = 'staging';
      try {
        return await buyer.submit();
      } finally {
        env.APP_ENV = previous;
      }
    },
  };
}