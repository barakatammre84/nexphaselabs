# Phase 9 — order-to-cash readiness

Owner direction (4 September 2026): build priorities 1–5, compare UPS and FedEx
shipping, keep guest checkout, leave WordPress/DNS alone. Work is in
`/Users/ammrebarakat/Developer/nexphaselabs.net`. Phase 8.5 work is concurrent
and must be preserved. This checklist is not business-launch approval.

## Acceptance and dependencies

| Capability | Existing | Acceptance still required |
|---|---|---|
| Purchasable catalog | Catalog manager, editable prices, lot intake/QC/release | Owner-approved prices and actual released quantities; actionable per-SKU readiness |
| Checkout and shipping | Server-priced cart and immutable order amounts; manual tracking | UPS/FedEx eligible-rate comparison, configured origin/packaging, quote expiry, approved tax treatment, total accepted before payment |
| Inventory commitments | Atomic decrement at shipment | Concurrent reservations, unpaid expiry/cancellation, paid holds, no consuming another order's allocation |
| Payment | Bank/BTCPay adapters, settlement signature, late-payment/refund recording | Durable pre-provider claim and uncertain-outcome recovery; approved provider and real reconciliation |
| Customer/staff handoff | Guest checkout, durable order notices, invoice/COA/packing slip, returns | Secure cross-device order recovery, delivered-message evidence, label/tracking automation and staff rehearsal |

## Owner inputs — do not invent these

- Approved selling price for each pack size (public list price and optional institutional price).
- Actual stock, manufacturer/QC/SDS evidence and authorized release decisions.
- Ship-from/return address, packed weights/dimensions, packing rules, handling fee policy,
  delivery constraints, and whether any material needs temperature control or dangerous-goods handling.
- UPS/FedEx accounts or approval to activate a multi-carrier shipping service; credentials through secrets, not documents.
- Payment-provider choice and approved account; tax registrations/treatment from the business's tax adviser.
- Approved email sender, named test recipients, and an inbox-delivery test.

## Sequence

1. Expose catalog and configuration blockers to staff without creating fictitious prices/stock.
2. Research shipping APIs and build a testable rate comparison boundary. Never purchase a label during a quote.
3. Implement inventory/payment concurrency controls and test actual SQL transactions.
4. Add guest recovery without using unverified email as account ownership or adding a checkout verification gate.
5. Re-audit integration and record evidence, remaining decisions, and deployment status here.

## Re-audit evidence — implementation pass 1

- Catalog readiness is now visible to admins per active SKU: public price, released one-pack stock and retest usability. It does not invent or approve values.
- A Shippo adapter requests rates only from configured UPS/FedEx carrier accounts, filters malformed/wrong-account/wrong-mode results and sorts eligible rates by postage. Staging refuses live keys. The staff quote tool cannot purchase a label. Direct UPS and FedEx APIs remain an alternative; the multi-carrier boundary was chosen to compare both accounts in one maintained integration and can be replaced without changing order rules.
- New reservations are atomic with order acceptance when `INVENTORY_RESERVATION_MINUTES` is configured. They do not decrement the lot ledger. Unpaid expiry/cancellation releases availability; paid/fulfilling holds do not expire; payment received after expiry becomes a refund obligation; shipment must use the reserved lot. Count-tracked inventory is refused until the lot records pack-size identity.
- Payment provider calls have a durable pre-call claim. Repeated/concurrent requests never create a second provider invoice; uncertain outcomes require reconciliation. A signed settlement received before local attachment requests redelivery instead of being discarded.
- Original guest browsers may create/rotate a private recovery code. Exchanging it creates a 24-hour read-only session for one order and its current invoice; matching contact email is not proof, and recovered access cannot pay/cancel or access other orders.
- Final verification passed on 4 September 2026: type-check, lint, 55 test files / 550 tests, the staging-target build, and a Cloudflare deployment dry run.

### Required next inputs / activation gates

- Staging still has 16 active published pack sizes and only BPC-157 has a released lot. The four BPC-157 variants now have audited, synthetic staging-only prices so the complete test transaction can be rehearsed. The other 12 variants remain unpriced/unavailable; production cannot be truthfully completed without approved prices and released inventory.
- Configure packed weights/dimensions (or product-to-package profiles), origin/return address and UPS/FedEx/Shippo test carrier accounts before connecting staff rate shopping to customer checkout. Test rates are not real negotiated prices.
- Decide shipping-charge policy (pass-through/markup/handling/free threshold), acceptable services/transit limits and address-correction policy.
- Decide tax treatment with an adviser and choose the tax calculation/filing service. The code still has no tax amount field; zero must not be silently approved.
- Configure and approve the payment rail, email sender/test allowlist and named testers. No real settlement, delivery, label or carrier handoff has been performed.

Live shipping/payment activation, paid labels, real customer communications, and production
cutover require configuration and explicit operational approval. Staging simulations do not
establish real rates, tax correctness, settlement, delivery, or inventory availability.

## Customer and fulfillment interface pass

Implemented locally after the first operational pass:

- Product pack rows now distinguish a priced but unavailable pack from one backed by a released lot, and explain that shipping and tax are shown before payment.
- Guest checkout is a guided Cart → Delivery → Payment → Confirmation flow with a persistent complete-total rail.
- Delivery comparison requests UPS and FedEx options, calculates tax per option, and stores a 30-minute server-owned quote. Order acceptance rejects a changed owner, email, address, cart, price, expired quote, or client-edited amount.
- Production tax is fail-closed and supports TaxJar's calculate-order endpoint. Staging can use an explicit synthetic tax rate; that mode is refused in production.
- Order pages now show progress and a materials / shipping / tax / total reconciliation, including the accepted carrier service.
- Staff can compare the actual packed parcel, purchase exactly one label per order, print a conspicuous test label in staging, and transfer carrier/tracking into shipment recording. Uncertain label outcomes enter an admin review queue and are never retried automatically.
- The five-minute scheduled worker removes expired disposable checkout and fulfillment quotes in bounded batches while preserving every quote referenced by a label as an audit record.

## Staging deployment and live rehearsal

- Applied additive D1 migrations 0030, 0032, 0033 and 0034 to `nexphase-labs-staging` only.
- Deployed Worker version `706ebd77-c169-457d-9daa-4cc397d42303` to `https://nexphaselabs-staging.ammre.workers.dev`; WordPress, DNS, production Worker, production D1 and production R2 were unchanged.
- Health returned HTTP 200 with database and document-store checks passing. A cross-origin checkout-quote request returned HTTP 403.
- Live browser rehearsal created guest order `NX-260905-0001`: BPC-157 5 mg, UPS Ground selected as the lowest eligible synthetic rate, $75.00 material + $9.00 shipping + $6.93 estimated tax = $90.93 total. The simulated payment completed with reference `TEST-NX-260905-0001`; no account or email verification and no real money movement occurred.
- Remote D1 verification found status/payment status `paid`, one 5,000 µg reservation against released lot `STG-001`, one attached payment attempt for $90.93 and three durable customer notifications. The notification records remain operational test evidence; inbox delivery was not claimed.

Still owner/configuration dependent:

- Approved product prices and enough released lot stock.
- Actual origin/return address and validated parcel dimensions/weights. The staging profile is synthetic and must not be copied to production.
- Connected Shippo UPS/FedEx accounts, live TaxJar configuration and nexus/taxability decisions.
- Live label cancellation/refund is deliberately a provider-dashboard step until the carrier-specific refund workflow is rehearsed.
