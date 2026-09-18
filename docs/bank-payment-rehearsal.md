# ACH and Zelle payment rehearsal

**Date:** 2026-09-18  
**Environment:** isolated local SQLite/D1-compatible database and private Chromium harness  
**Result:** core workflows verified locally; refund-reference idempotency is
resolved locally, while **one reproducible defect remains**.
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
| Completed refund | A distinct-reference top-up marks the refund complete. Refund/fulfillment controls disappear; a same-reference post-completion retry is rejected as already recorded and cannot increase totals or events. |
| Refund authorization | Buyer and operations staff cannot submit refunds; only the authorized admin gets refund controls. |
| Simultaneous stale partial-refund calls | Exactly one succeeds; optimistic concurrency prevents two ledger writes from the same stale snapshot. |
| Sequential refund-reference reuse | **Resolved locally:** for ACH and Zelle, immediate same-reference retries, retries after distinct-reference top-ups, mismatched-amount reuse, and retries after completion are rejected without increasing refund totals or events. Distinct references still top up the refund. |
| Reloading the settled Zelle claim URL | **Defect:** obsolete checking-bank message remains alongside confirmed payment; see finding 2. |

### Commands and results

Requires Node 22.13+; browser command also requires `chromium` on `PATH`.
No credentials or running store are required.

```sh
npm run test:bank:browser
# 1 file passed; 8 passing cases + 1 expected failure documenting finding 2

npm test
# 159 files; 1,451 passing cases, including 24 ACH/Zelle refund retry regressions

npm run typecheck
# passed

npx oxlint lib/orders.ts lib/order-rules.ts db/commerce-schema.ts \
  'app/api/manage/orders/[orderNumber]/refund/route.ts' \
  tests/bank-payment-retry-findings.test.ts tests/refund-rules.test.ts \
  tests/bank-payment.browser.ts
# passed
```

The remaining browser `it.fails` case asserts the intended safe behavior for
finding 2. Its expected failure is a **known defect**, not evidence that the
requirement passed. Finding 1 now has ordinary passing service and browser
regressions. The isolated D1-compatible suite also covers racing same/different
references, amount conflicts, per-order scoping, migration of historical duplicate
references, and atomic rollback if the identity, event, or notification insert fails.

Browser screenshots were generated under `outputs/bank-payment-rehearsal/`:
buyer/staff views at zero, partial and complete refund states for both payment
methods, both ordinary cancellation and expired holds; automatic Zelle settlement;
ACH/Zelle refund-reference retry rejection after completion; and the
stale-claim-message finding. Outputs are intentionally ignored by Git.
The new completion/retry evidence is
`bank_transfer-refund-reference-retry.jpg` and
`zelle-refund-reference-retry.jpg`.

The separate local storefront preview rendered its research-use gate, but logged
`[catalog] read failed`. It was not used for payment evidence, and this rehearsal
does not certify that preview's catalog configuration.

## Findings

### 1. Resolved locally: repeated partial-refund reference double-counting

**Previous observation:** a fresh-read retry with the same amount and synthetic
bank reference could count the refund twice and add a second ledger event.

**Local resolution:** refund references are now durable per-order idempotency
keys. Browser regressions exercise both ACH and Zelle and verify that immediate
same-reference retries, retries after an intervening distinct-reference top-up,
mismatched-amount reuse, and retries after completion all return descriptive
“already recorded” or “different amount” errors without increasing refund totals
or event counts. Buyer and staff sent/remaining totals also remain unchanged
after every rejection. Distinct-reference top-ups continue to work and can
complete the refund.

Migration `0070_order_refund_references.sql` creates the durable reference
registry. It reserves references recoverable from canonical historical refund
event notes and each order's latest refund reference; legacy recovered
references have an unknown amount. The migration prevents reuse but deliberately
does **not** guess at or correct any historically inflated refund total.
Migration 0070 must be applied before deploying the application change. It was
not applied to staging or production during this rehearsal.

**Relevant code:** `lib/orders.ts` (`recordRefund`),
`app/api/manage/orders/[orderNumber]/refund/route.ts`,
`tests/bank-payment-retry-findings.test.ts`.

This is local synthetic evidence only. Staging data and live payment providers
were not accessed, and no live operation was performed.

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

No deployment configuration or live environment was changed during this local
verification.