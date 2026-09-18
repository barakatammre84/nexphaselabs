# ACH and Zelle payment rehearsal

**Date:** 2026-09-18  
**Environment:** isolated local SQLite/D1-compatible database and private Chromium harness  
**Result:** core workflows verified locally; **two reproducible defects remain**.
This is not a clean payment-readiness sign-off.

## Safety and scope

- No money sent, bank connection opened, production buyer data accessed, real
  customer messages sent, remote database queried, deployment performed, or live
  configuration changed.
- All buyer/contact/recipient data is synthetic. Notifications remain inert
  records in an in-memory database that is destroyed after each scenario.
- Application `fetch` is replaced by a reject-all function and asserted unused.
  Browser requests are restricted to the private loopback origin; service
  workers are disabled. Each scenario uses fresh browser contexts and database.
- The ACH adapter is exercised inside Vitest's mocked `cloudflare:workers`
  module, not through the running app or staging. No actual environment variable
  is changed. Production-only payment guards are unchanged.
- Order/cart setup uses real commerce services under a temporary, private staging
  mock to avoid the production carrier-quote requirement. The mock is restored
  before the real ACH instruction adapter is invoked. Shipping purchase/quotes
  are not part of this payment rehearsal.
- The browser harness serves the actual buyer/staff order pages and invokes the
  actual payment, claim, settlement, cancellation, and refund POST handlers.
  Native HTML form navigation and redirects run in Chromium.
  Authentication principals are synthetic; real role-permission, ownership
  queries, and same-origin checks remain in use.
- These are server-rendered pages without the deployed layout, styles or client
  hydration. Login/session issuance, clipboard buttons, shipping purchase, email
  delivery, and Cloudflare runtime behavior are **not** validated by this harness.
  Order creation is exercised through commerce services, not the storefront
  checkout form.

## Local evidence

| Scenario | Observed result |
| --- | --- |
| ACH environment safety | Development, staging, missing/unknown environment cannot offer ACH despite synthetic bank instructions. Integrated tests also reject ACH lookup/setup in development and staging. |
| Exact instructions | ACH shows exact amount/currency and order-number reference; says selecting it does not debit the account. Zelle shows the exact amount, synthetic recipient and order memo. |
| Zelle buyer claim | Claim and repeated claim leave payment pending; no settlement event; one claim record. Staff sees claim evidence. |
| Authorized manual settlement | Admin records synthetic cleared-bank reference. Missing reference, cross-origin request, buyer and operations-role attempts do not settle the order. |
| Automatic Zelle | Synthetic authenticated bank notification with exact amount/memo settles once. Re-delivery is idempotent; another receipt is held as possible duplicate. Wrong amount/memo remains unpaid for review. Automatic mode refuses manual-payment override. Buyer sees confirmed payment; staff sees a matched receipt and claim. |
| Setup/settlement retries | Repeated setup and stale/repeated settlement do not duplicate attempts or settlement events. |
| Expired stock hold | ACH and Zelle late payments cancel fulfillment and create the exact full refund obligation. Browser staff warning says nothing may ship. Released holds permit a competing order; settlement does not decrement physical lot stock. |
| Zero sent | Buyer says no refund has been sent and shows the full remaining amount. Staff shows `$0.00 sent of … owed`. A zero-dollar refund submission is rejected. |
| Partial refund | Buyer and staff show the exact recorded amount and remaining obligation. Excess refund is rejected. |
| Completed refund | A distinct-reference top-up marks the refund complete. Refund/fulfillment controls disappear; post-completion retry cannot increase the recorded refund. |
| Refund authorization | Buyer and operations staff cannot submit refunds; only the authorized admin gets refund controls. |
| Simultaneous stale partial-refund calls | Exactly one succeeds; optimistic concurrency prevents two ledger writes from the same stale snapshot. |
| Later same-reference partial-refund retry | **Defect:** a fresh-read retry counts the same refund again; see finding 1. |
| Reloading the settled Zelle claim URL | **Defect:** obsolete checking-bank message remains alongside confirmed payment; see finding 2. |

### Commands and results

Requires Node 22.13+; browser command also requires `chromium` on `PATH`.
No credentials or running store are required.

```sh
npm run test:bank:browser
# 6 passing cases + 1 expected failure documenting finding 2

npx vitest run \
  tests/bank-payment-rehearsal.test.ts \
  tests/bank-payment-retry-findings.test.ts \
  tests/zelle.test.ts tests/manual-payment-rules.test.ts \
  tests/payment-recovery.test.ts tests/bank-payment-copy.test.ts \
  tests/order-refund-status.test.ts tests/reconcile-payment-confirmation.test.ts
# 8 files; 52 passing cases + 1 expected failure documenting finding 1

npm run typecheck
# passed

npx oxlint tests/bank-payment* tests/helpers/bank-payment-rehearsal.ts
# passed
```

The two `it.fails` cases assert the intended safe behavior. Their expected
failures are **known defects**, not evidence that those requirements passed.
When fixed, convert them to ordinary passing regression tests. Each finding also
has observed-state assertions or browser evidence.

Browser screenshots are generated under `outputs/bank-payment-rehearsal/`:
buyer/staff views at zero, partial and complete refund states for both payment
methods, both ordinary cancellation and expired holds; automatic Zelle settlement;
and the stale-claim-message finding. Outputs are intentionally ignored by Git.

The separate local storefront preview rendered its research-use gate, but logged
`[catalog] read failed`. It was not used for payment evidence, and this rehearsal
does not certify that preview's catalog configuration.

## Findings requiring fixes

### 1. High: repeated partial-refund reference double-counts refunded money

**Observed:** a cancelled ACH order owes `$4.00`. Recording `$1.00` with one
synthetic bank reference produces `refundCents=100`. Repeating that same amount
and reference after reloading the order succeeds again, produces
`refundCents=200`, and adds a second refund ledger event. No money moved in either
operation. The recorded refund can therefore overstate what was actually sent.

The optimistic guard protects a concurrent/stale snapshot, but not a sequential
retry after a fresh read. The shared implementation is used for ACH and Zelle;
the dedicated retry reproduction uses ACH.

**Relevant code:** `lib/orders.ts` (`recordRefund`),
`app/api/manage/orders/[orderNumber]/refund/route.ts`,
`tests/bank-payment-retry-findings.test.ts`.

**Next fix:** persist a per-order refund identity/reference and atomically prevent
reusing it, including after other partial refunds. Preserve distinct-reference
top-ups and reject mismatched reuse. Until fixed, reconcile existing refund
history before retrying a manual refund record; do not interpret a repeated
submission as evidence of another bank refund.

### 2. Medium: obsolete Zelle claim banner survives settlement

**Observed:** buyer submits the Zelle claim and remains on `?zelle=claimed`.
Admin confirms receipt. Reloading that original URL shows both “Payment is
confirmed” and “We are checking Chase; do not send it again.”

The claim banner checks that a claim exists, not that it is still pending on an
awaiting-payment order.

**Relevant code:** `app/account/orders/[orderNumber]/page.tsx`,
`tests/bank-payment.browser.ts`.

**Next fix:** make the claim-confirmation message conditional on current order
and claim state; cover paid, cancelled/refund-due, and fully refunded reloads.

## Staging and live-provider evidence

- **Cloudflare staging:** not accessed or modified; no staging result claimed.
- **Production:** not accessed or modified; no live readiness result claimed.
- **Banks/Gmail:** no actual ACH transfer, Zelle transfer, bank-clearing event,
  provider refund, OAuth/mailbox polling or real notification authentication was
  verified. The notification headers and evidence were synthetic inputs.
- **Manual refunds:** only the application's record of an externally completed
  refund was exercised. The app did not send refund money.
- **Cards:** outside scope and not tested or presented as available.

No production application code, database migration or deployment configuration
was changed during this verification-only task.