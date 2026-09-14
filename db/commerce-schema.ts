import { sql } from 'drizzle-orm';
import {
  check,
  index,
  integer,
  sqliteTable,
  text,
  uniqueIndex,
} from 'drizzle-orm/sqlite-core';
import { accounts, lots, orderItems, orders } from './schema';

/** One durable attempt per order. An uncertain external request is NEVER retried by creating another invoice. */
export const paymentAttempts = sqliteTable(
  'payment_attempts',
  {
    orderId: text('order_id')
      .primaryKey()
      .references(() => orders.id),
    id: text('id').notNull(),
    method: text('method').notNull(),
    state: text('state').notNull(), // requesting | ready | attached | attention
    reference: text('reference'),
    amountCents: integer('amount_cents').notNull(),
    currency: text('currency').notNull(),
    actor: text('actor').notNull(),
    createdAt: integer('created_at', { mode: 'timestamp' })
      .notNull()
      .default(sql`(unixepoch())`),
    updatedAt: integer('updated_at', { mode: 'timestamp' })
      .notNull()
      .default(sql`(unixepoch())`),
  },
  (t) => [
    uniqueIndex('payment_attempts_id_idx').on(t.id),
    check(
      'payment_attempts_state_check',
      sql`${t.state} IN ('requesting','ready','attached','attention')`,
    ),
    check('payment_attempts_amount_check', sql`${t.amountCents} >= 0`),
  ],
);

/** A buyer may tell us that a Zelle payment was sent. This is a prompt to look,
 * never evidence that money arrived. One row per order makes repeated clicks
 * harmless and preserves the first claimed time. */
export const zellePaymentClaims = sqliteTable(
  'zelle_payment_claims',
  {
    orderId: text('order_id')
      .primaryKey()
      .references(() => orders.id),
    payerName: text('payer_name'),
    claimedBy: text('claimed_by').notNull(),
    /** pending | review | matched | closed */
    status: text('status').notNull().default('pending'),
    matchedReceiptId: text('matched_receipt_id'),
    claimedAt: integer('claimed_at', { mode: 'timestamp' })
      .notNull()
      .default(sql`(unixepoch())`),
    updatedAt: integer('updated_at', { mode: 'timestamp' })
      .notNull()
      .default(sql`(unixepoch())`),
  },
  (t) => [
    index('zelle_payment_claims_status_idx').on(t.status, t.claimedAt),
    check(
      'zelle_payment_claims_status_check',
      sql`${t.status} IN ('pending','review','matched','closed')`,
    ),
  ],
);

/** Minimal, immutable financial evidence parsed from a message fetched directly
 * from the controlled Gmail mailbox. Raw email bodies and unrelated mailbox
 * content are deliberately not retained. */
export const zelleReceipts = sqliteTable(
  'zelle_receipts',
  {
    id: text('id').primaryKey(),
    sourceMessageId: text('source_message_id').notNull(),
    sourceThreadId: text('source_thread_id'),
    messageHash: text('message_hash').notNull(),
    sender: text('sender').notNull(),
    recipient: text('recipient').notNull(),
    /** verified | failed | unknown */
    authentication: text('authentication').notNull(),
    /** received | negative | unknown */
    completion: text('completion').notNull(),
    amountCents: integer('amount_cents'),
    currency: text('currency').notNull().default('USD'),
    payerName: text('payer_name'),
    memo: text('memo'),
    orderNumber: text('order_number'),
    occurredAt: integer('occurred_at', { mode: 'timestamp' }),
    orderId: text('order_id').references(() => orders.id),
    /** received | review | matched | refund_due | rejected | duplicate | ignored */
    outcome: text('outcome').notNull().default('received'),
    outcomeDetail: text('outcome_detail'),
    parserVersion: text('parser_version').notNull(),
    decidedBy: text('decided_by'),
    receivedAt: integer('received_at', { mode: 'timestamp' })
      .notNull()
      .default(sql`(unixepoch())`),
    processedAt: integer('processed_at', { mode: 'timestamp' }),
  },
  (t) => [
    uniqueIndex('zelle_receipts_message_idx').on(t.sourceMessageId),
    uniqueIndex('zelle_receipts_hash_idx').on(t.messageHash),
    index('zelle_receipts_outcome_idx').on(t.outcome, t.receivedAt),
    index('zelle_receipts_order_idx').on(t.orderId, t.receivedAt),
    index('zelle_receipts_number_idx').on(t.orderNumber),
    check(
      'zelle_receipts_authentication_check',
      sql`${t.authentication} IN ('verified','failed','unknown')`,
    ),
    check(
      'zelle_receipts_completion_check',
      sql`${t.completion} IN ('received','negative','unknown')`,
    ),
    check(
      'zelle_receipts_outcome_check',
      sql`${t.outcome} IN ('received','review','matched','refund_due','rejected','duplicate','ignored')`,
    ),
    check(
      'zelle_receipts_amount_check',
      sql`${t.amountCents} IS NULL OR ${t.amountCents} > 0`,
    ),
  ],
);

/** Health cursor for the bounded Gmail poll. A failed run never advances the
 * successful timestamp, so the next run repeats the lookback and relies on the
 * receipt uniqueness constraints. */
export const zelleMailboxState = sqliteTable('zelle_mailbox_state', {
  mailbox: text('mailbox').primaryKey(),
  lastSuccessfulAt: integer('last_successful_at', { mode: 'timestamp' }),
  lastMessageCount: integer('last_message_count').notNull().default(0),
  lastError: text('last_error'),
  updatedAt: integer('updated_at', { mode: 'timestamp' })
    .notNull()
    .default(sql`(unixepoch())`),
});

/** Append-only daily comparison between Chase activity and receipts accepted by
 * the store. A later correction is another signed run, never an overwritten row. */
export const zelleReconciliationRuns = sqliteTable(
  'zelle_reconciliation_runs',
  {
    id: text('id').primaryKey(),
    businessDate: text('business_date').notNull(),
    chaseReceivedCents: integer('chase_received_cents').notNull(),
    chaseRefundedCents: integer('chase_refunded_cents').notNull().default(0),
    matchedCents: integer('matched_cents').notNull(),
    matchedCount: integer('matched_count').notNull(),
    exceptionCount: integer('exception_count').notNull(),
    differenceCents: integer('difference_cents').notNull(),
    actor: text('actor').notNull(),
    note: text('note'),
    createdAt: integer('created_at', { mode: 'timestamp' })
      .notNull()
      .default(sql`(unixepoch())`),
  },
  (t) => [
    index('zelle_reconciliation_date_idx').on(t.businessDate, t.createdAt),
    check('zelle_reconciliation_received_check', sql`${t.chaseReceivedCents} >= 0`),
    check('zelle_reconciliation_refunded_check', sql`${t.chaseRefundedCents} >= 0`),
    check('zelle_reconciliation_matched_check', sql`${t.matchedCents} >= 0`),
    check('zelle_reconciliation_count_check', sql`${t.matchedCount} >= 0 AND ${t.exceptionCount} >= 0`),
  ],
);

/** A recovery code grants only one order, never all orders for a contact email or guest session. */
export const guestOrderKeys = sqliteTable('guest_order_keys', {
  orderId: text('order_id')
    .primaryKey()
    .references(() => orders.id),
  tokenHash: text('token_hash').notNull(),
  expiresAt: integer('expires_at', { mode: 'timestamp' }).notNull(),
  createdAt: integer('created_at', { mode: 'timestamp' })
    .notNull()
    .default(sql`(unixepoch())`),
});
export const guestOrderSessions = sqliteTable(
  'guest_order_sessions',
  {
    tokenHash: text('token_hash').primaryKey(),
    orderId: text('order_id')
      .notNull()
      .references(() => orders.id),
    expiresAt: integer('expires_at', { mode: 'timestamp' }).notNull(),
    createdAt: integer('created_at', { mode: 'timestamp' })
      .notNull()
      .default(sql`(unixepoch())`),
  },
  (t) => [index('guest_order_sessions_order_idx').on(t.orderId)],
);

/** Integer micrograms for mass, containers for count. No material leaves the ledger on reservation. */
export const inventoryReservations = sqliteTable(
  'inventory_reservations',
  {
    itemId: text('item_id')
      .primaryKey()
      .references(() => orderItems.id),
    orderId: text('order_id')
      .notNull()
      .references(() => orders.id),
    lotId: text('lot_id')
      .notNull()
      .references(() => lots.id),
    units: integer('units').notNull(),
    unit: text('unit').notNull(),
    expiresAt: integer('expires_at', { mode: 'timestamp' }).notNull(),
    createdAt: integer('created_at', { mode: 'timestamp' })
      .notNull()
      .default(sql`(unixepoch())`),
  },
  (t) => [
    index('inventory_reservations_lot_idx').on(t.lotId),
    index('inventory_reservations_order_idx').on(t.orderId),
    check('inventory_reservations_units_check', sql`${t.units} > 0`),
  ],
);

/**
 * A short-lived, server-priced checkout option. The browser submits only this
 * id; order acceptance re-checks the owner, cart, address and expiry before
 * copying shipping/tax into the immutable order record.
 */
export const checkoutQuotes = sqliteTable(
  'checkout_quotes',
  {
    id: text('id').primaryKey(),
    accountId: text('account_id')
      .notNull()
      .references(() => accounts.id),
    cartFingerprint: text('cart_fingerprint').notNull(),
    addressFingerprint: text('address_fingerprint').notNull(),
    originId: text('origin_id').notNull().default('primary'),
    originLabel: text('origin_label').notNull().default('Primary location'),
    provider: text('provider').notNull(),
    shipmentId: text('shipment_id').notNull(),
    rateId: text('rate_id').notNull(),
    carrier: text('carrier').notNull(),
    service: text('service').notNull(),
    serviceName: text('service_name').notNull(),
    shippingCents: integer('shipping_cents').notNull(),
    taxCents: integer('tax_cents').notNull(),
    currency: text('currency').notNull().default('USD'),
    estimatedDays: integer('estimated_days'),
    test: integer('test', { mode: 'boolean' }).notNull().default(false),
    expiresAt: integer('expires_at', { mode: 'timestamp' }).notNull(),
    createdAt: integer('created_at', { mode: 'timestamp' })
      .notNull()
      .default(sql`(unixepoch())`),
  },
  (t) => [
    index('checkout_quotes_account_idx').on(t.accountId),
    index('checkout_quotes_expiry_idx').on(t.expiresAt),
    check(
      'checkout_quotes_carrier_check',
      sql`${t.carrier} IN ('USPS','UPS','FedEx')`,
    ),
    check(
      'checkout_quotes_amount_check',
      sql`${t.shippingCents} > 0 AND ${t.taxCents} >= 0`,
    ),
  ],
);

/** Fresh packed-parcel rates generated by staff for a specific order. */
export const fulfillmentQuotes = sqliteTable(
  'fulfillment_quotes',
  {
    id: text('id').primaryKey(),
    orderId: text('order_id')
      .notNull()
      .references(() => orders.id),
    originId: text('origin_id').notNull().default('primary'),
    originLabel: text('origin_label').notNull().default('Primary location'),
    provider: text('provider').notNull(),
    shipmentId: text('shipment_id').notNull(),
    rateId: text('rate_id').notNull(),
    carrier: text('carrier').notNull(),
    service: text('service').notNull(),
    serviceName: text('service_name').notNull(),
    amountCents: integer('amount_cents').notNull(),
    currency: text('currency').notNull().default('USD'),
    estimatedDays: integer('estimated_days'),
    test: integer('test', { mode: 'boolean' }).notNull().default(false),
    expiresAt: integer('expires_at', { mode: 'timestamp' }).notNull(),
    createdBy: text('created_by').notNull(),
    createdAt: integer('created_at', { mode: 'timestamp' })
      .notNull()
      .default(sql`(unixepoch())`),
  },
  (t) => [
    index('fulfillment_quotes_order_idx').on(t.orderId),
    check(
      'fulfillment_quotes_carrier_check',
      sql`${t.carrier} IN ('USPS','UPS','FedEx')`,
    ),
    check('fulfillment_quotes_amount_check', sql`${t.amountCents} > 0`),
  ],
);

/** One durable label-purchase claim per order prevents duplicate carrier charges. */
export const shippingLabels = sqliteTable(
  'shipping_labels',
  {
    id: text('id').primaryKey(),
    orderId: text('order_id')
      .notNull()
      .references(() => orders.id),
    quoteId: text('quote_id')
      .notNull()
      .references(() => fulfillmentQuotes.id),
    state: text('state').notNull(), // requesting | ready | voiding | attention | voided
    originId: text('origin_id').notNull().default('primary'),
    originLabel: text('origin_label').notNull().default('Primary location'),
    providerRef: text('provider_ref'),
    labelUrl: text('label_url'),
    trackingNumber: text('tracking_number'),
    carrier: text('carrier').notNull(),
    serviceName: text('service_name').notNull(),
    amountCents: integer('amount_cents').notNull(),
    test: integer('test', { mode: 'boolean' }).notNull().default(false),
    error: text('error'),
    refundState: text('refund_state'), // requesting | pending | success | attention
    refundRef: text('refund_ref'),
    refundReason: text('refund_reason'),
    refundRequestedBy: text('refund_requested_by'),
    refundRequestedAt: integer('refund_requested_at', { mode: 'timestamp' }),
    refundUpdatedAt: integer('refund_updated_at', { mode: 'timestamp' }),
    createdBy: text('created_by').notNull(),
    createdAt: integer('created_at', { mode: 'timestamp' })
      .notNull()
      .default(sql`(unixepoch())`),
    updatedAt: integer('updated_at', { mode: 'timestamp' })
      .notNull()
      .default(sql`(unixepoch())`),
  },
  (t) => [
    index('shipping_labels_order_idx').on(t.orderId),
    uniqueIndex('shipping_labels_active_order_idx')
      .on(t.orderId)
      .where(sql`${t.state} <> 'voided'`),
    check(
      'shipping_labels_state_check',
      sql`${t.state} IN ('requesting','ready','voiding','attention','voided')`,
    ),
    check(
      'shipping_labels_refund_state_check',
      sql`${t.refundState} IS NULL OR ${t.refundState} IN ('requesting','pending','success','attention')`,
    ),
    check('shipping_labels_amount_check', sql`${t.amountCents} > 0`),
  ],
);

/**
 * Carrier events received from Shippo. The provider event key is deterministic,
 * so webhook redelivery cannot repeat a business action. Raw payloads are not
 * retained: they can contain addresses and other customer data we do not need.
 */
export const shippingTrackingEvents = sqliteTable(
  'shipping_tracking_events',
  {
    id: text('id').primaryKey(),
    providerEventKey: text('provider_event_key').notNull(),
    eventName: text('event_name').notNull(),
    carrier: text('carrier').notNull(),
    trackingNumber: text('tracking_number').notNull(),
    providerStatusId: text('provider_status_id'),
    providerTransactionId: text('provider_transaction_id'),
    status: text('status').notNull(),
    statusDetail: text('status_detail'),
    statusAt: integer('status_at', { mode: 'timestamp' }),
    test: integer('test', { mode: 'boolean' }).notNull().default(false),
    verified: integer('verified', { mode: 'boolean' }).notNull().default(false),
    orderId: text('order_id').references(() => orders.id),
    /** received | verification_retry | recorded | delivered | unmatched | ignored | attention */
    outcome: text('outcome').notNull().default('received'),
    outcomeDetail: text('outcome_detail'),
    receivedAt: integer('received_at', { mode: 'timestamp' })
      .notNull()
      .default(sql`(unixepoch())`),
    processedAt: integer('processed_at', { mode: 'timestamp' }),
  },
  (t) => [
    uniqueIndex('shipping_tracking_events_key_idx').on(t.providerEventKey),
    index('shipping_tracking_events_tracking_idx').on(t.trackingNumber),
    index('shipping_tracking_events_order_idx').on(t.orderId),
    index('shipping_tracking_events_outcome_idx').on(t.outcome, t.receivedAt),
    check(
      'shipping_tracking_events_outcome_check',
      sql`${t.outcome} IN ('received','verification_retry','recorded','delivered','unmatched','ignored','attention')`,
    ),
  ],
);
