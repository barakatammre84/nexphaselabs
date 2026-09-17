# Future-stock ordering and payment plan

## Owner decision — September 17, 2026

The owner selected **automatic collection**, with **explicit customer consent
at checkout** and an **email notice 48 hours before charging**.
Invoice-on-restock was not selected. This authorizes planning only, not
implementation, backorders, production mutations, deployment, messages or charges.
Removing the available-stock quantity cap does not authorize future-stock sales.

Existing release, QC, expiry, inventory, parcel, research-use and payment gates
remain mandatory. This document makes no runtime or schema changes.

## Provider prerequisite and legal constraints

`lib/payments.ts` supports Zelle, bank-transfer instructions, BTCPay and manual
invoices, not authorized automatic later debits. Its policy comment excludes
mainstream card processors for the product category; this is an existing
repository constraint, not independently verified legal or provider advice.

Before implementation, establish a provider that expressly permits the actual
catalog and supports setup without purchase collection, off-session collection,
mandates/revocation, idempotency, authenticated events, payment lookup and refunds.
Confirm authorization lifetime, re-authorization, advance-notice, authentication,
settlement, return and refund requirements with that provider. Do not assume
Stripe is permitted, treat inbound bank-transfer instructions as debit consent,
or hold a purchase authorization for an indefinite restock period.

If no provider qualifies, keep future-stock ordering disabled. Do not silently
substitute invoicing. If provider rules require longer notice, reconcile that
with the owner before launch; never shorten the 48-hour minimum.

## Proposed operating rules (not additional owner-approved terms)

- Opt in individual SKU/pack combinations against staff-confirmed incoming
  quantities and estimated availability windows; never allow unlimited orders.
- Initially require separate in-stock and future-stock checkouts. Reject mixed
  carts clearly instead of silently splitting orders or duplicating shipping.
- Confirm queue position only after payment setup and explicit consent succeed.
  Allocate in durable confirmation order; audit staff exceptions.
- Allocate the whole order before notice/collection; no partial debits or
  partial fulfillment initially. Preserve one released lot per order line.
- Snapshot items, quantities, shipping, tax, currency and final authorized total.
  Do not increase the debit. Material changes require new authorization and a
  fresh notice window, not edits to an already authorized payment.
- Allow cancellation before collection is claimed. Reconcile cancellation
  races with a pending provider operation rather than promising an instant refund.
- No automatic new debit after a definitive decline initially. Ask the customer
  to update authorization and send a fresh notice before another attempt.
- Resolve payment-action deadlines, maximum restock delay, reservation expiry,
  authorization-expiry treatment and cancellation/refund terms before launch.
  These must be explicit settings and disclosed terms, not silent defaults.

## Availability and allocation — `lib/inventory-reservations.ts`

Add separate incoming-supply and future-allocation records: SKU/pack,
safe-integer quantity/unit, confirmed capacity, estimated window, lifecycle,
order linkage, queue position and audit evidence. Never fabricate released lots
or count incoming supply as on-hand inventory. Keep current stock guards intact.

Use atomic capacity checks/claims to prevent concurrent future orders exceeding
confirmed supply. A setup-pending order gets a bounded provisional claim; failed
or abandoned setup releases it. Successful setup and consent confirm the claim.
Capacity reductions must flag affected orders and notify customers, not silently
cancel allocations or collect for unavailable stock.

After receipt and QC release, atomically convert commitments to actual eligible
lot reservations, in competition with ordinary buyers. The current single-lot
rule still applies; enough aggregate supply does not prove one lot fills a line.
Do not reserve released stock for the entire wait for incoming supply.

The released-stock hold must cover the 48-hour notice and payment reconciliation.
Existing short checkout holds cannot simply be reused. Uncertain payments must
retain protection and enter bounded operational escalation, not silently expire
and allow the stock to be sold again.

Recheck eligibility before collection and fulfillment. Lost QC/release/expiry
eligibility blocks collection, invalidates the notice schedule and triggers an
update. Replacement allocation requires a fresh notice window.

## Order lifecycle — `lib/orders.ts`

Introduce explicit future-stock states, separate from ordinary submitted orders:

1. `setup_pending`: checkout validated; provisional incoming-capacity claim;
   no purchase charge.
2. `waiting_stock`: payment setup and consent verified; confirmed future claim;
   send confirmation with estimate, total and cancellation path.
3. `notice_pending`: whole order backed by eligible released stock; enqueue email.
4. `notice_sent`: email transport accepted notice; persist charge-not-before.
5. `collecting`: atomically claim a debit after all collection gates pass.
6. `payment_pending`: unresolved or pending provider outcome; reconcile, not paid.
7. `paid`: verified provider success/required settlement plus valid inventory;
   enter existing guarded fulfillment flow.

Add explicit delayed, payment-action-required, cancelled, refund-due and refunded
outcomes. Keep transitions in guarded services and durable order events, not UI
status edits. Cancellation atomically prevents a new collection claim and releases
unneeded allocations; revoke applicable authorization. If collection already
started, resolve the provider result before releasing protected stock.

Late success after cancellation or loss of stock eligibility creates refund-due
and staff attention; never reopen fulfillment. Mark refunded only after provider
confirmation. Authorizations that expire or are revoked suspend collection:
obtain fresh customer authorization and issue a new notice, never silently renew.
An unacceptable restock delay must follow the agreed cancellation policy.

## Payment lifecycle — `lib/payments.ts`, `lib/payment-attempts.ts`

Add a provider adapter only after eligibility is confirmed. Model setup, debit
and refund as separate durable operations. Store provider references and minimal
consent evidence (text/version, timestamp, authorized total and mandate linkage),
not raw bank/card details or secrets. Use provider-hosted setup and the existing
secrets flow.

Do not reinterpret the current single invoice-attempt row as a repeat debit loop.
Define operation identities and provider idempotency keys scoped to order,
authorization version and operation type. Persist claims before external calls.
Retries after transport failure retain the same operation identity. Unknown
outcomes must be looked up/reconciled, not replaced by a new debit. Prevent manual
payment and automatic collection from collecting the same order twice.

Authenticate webhooks; check merchant, amount, currency, operation and order.
Deduplicate provider event IDs; handle reordering, duplicate delivery, missing
events and a crash after provider success. Setup success is not payment success.
Pending bank debits are not paid until the required settlement state is verified.
Returns and reversals require explicit order and operational handling.

For definitive failure, suspend automatic attempts, notify the customer and use
the approved payment-action deadline. New authorization requires a new notice.
After success, send receipt; cancellation/refund follows disclosed terms and
provider-confirmed outcomes rather than a local status toggle.

## Notices and collection jobs

Use `lib/notifications.ts`, `lib/scheduled-jobs.ts` and `worker.ts` for durable
outbox delivery and bounded leased jobs. Notice includes items, final total,
payment-method summary, expected charge date/time/timezone and cancellation link.

Charge no earlier than 48 elapsed hours after the email provider accepts the
notice, not 48 hours after enqueue. Acceptance is not proof of inbox delivery:
known bounces, failures or absent acceptance block collection and require
attention. Delayed email moves the charge time. Retries cannot shorten the window.
Invalidated or rescheduled collection requires a fresh notice.

The collection claim must atomically verify active consent/version, unchanged
authorized total, accepted notice/version, elapsed window, eligible reserved
stock, active order and no success or unresolved debit. Recheck expiry and
revocation. Send confirmation, delay, payment-action, cancellation and refund
notices via the outbox; keep transactional notices separate from marketing.

## Product, cart, checkout and management UI

- `components/site/product-purchase-panel.tsx`: show future-stock purchase only
  for enabled capacity-backed items. Display the estimated window and “no payment
  now; automatic charge after restock and 48-hour email notice.” Keep the existing
  informational waitlist available otherwise; do not convert waitlist entries
  into orders or payment permission.
- `lib/cart.ts`, `app/api/cart/route.ts`, `app/api/cart/update/route.ts`,
  `components/site/cart-drawer.tsx`, `app/account/cart/page.tsx`: persist explicit
  purchase mode, distinguish incoming capacity from available stock and enforce
  mixed-cart restrictions. Revalidate quantities/mode on create, edit and checkout;
  removing a cart line must not cancel an already confirmed order.
- `components/site/checkout-experience.tsx`,
  `components/site/checkout-fields.tsx`, `lib/checkout-quotes.ts`: show the exact
  authorized total and an unchecked, separate later-charge consent control.
  Require verified hosted payment setup and server-side consent before confirming.
  Preserve research-use and current customer/guest eligibility controls.
- Customer order detail: show estimated availability, allocation/payment state,
  scheduled charge, cancellation and secure payment-update controls. Preserve
  verified guest order access; an order ID alone is not authorization.
- Staff inventory/order views: manage confirmed incoming capacity and estimates,
  inspect allocation queue, notices, mandates and payment exceptions. Audit
  overrides; no bypass of consent, notice, QC or payment confirmation.

## Separate implementation sequence and validation

1. Confirm permitted provider capabilities and resolve proposed operating terms.
2. Add additive schema/migrations and guarded inventory/order/payment services
   behind a default-off future-stock flag; preserve ordinary checkout.
3. Add test-mode setup, webhooks, reconciliation and notice/collection jobs;
   complete product/cart/customer/staff screens.
4. Extend existing inventory reservation, order transaction, payment attempt and
   recovery, notification, product panel, cart and guest-checkout tests:
   - Concurrent capacity claims, abandoned setup, capacity reduction, full-order
     single-lot allocation, safe arithmetic, QC loss and stock expiry.
   - Missing/revoked/expired consent; changed total; notice failure/delay/bounce;
     reject collection at 47:59:59 and permit no earlier than 48 elapsed hours.
   - Duplicate jobs/events, out-of-order events, uncertain debit, crash after
     success, decline, refreshed authorization and delayed settlement.
   - Cancellation/collection race, manual-payment race, late success, refunds,
     returns/reversals and no shipment before verified payment.
   - Product/cart create/edit/remove, mixed checkout, customer/guest authorization,
     cancellation, payment updates and staff exception handling.
   - Existing available-stock, research-use, waitlist and payment paths unchanged.
5. Verify locally and in explicitly authorized isolated staging with test
   payments/messages. Production migration, enablement and deployment each require
   separate authorization. Provide a stop-collection switch that leaves payment
   reconciliation/refunds running; do not delete pending operations to roll back.

Provider approval and feature implementation remain future work. Backorders and
automatic collection remain disabled by this documentation-only change.