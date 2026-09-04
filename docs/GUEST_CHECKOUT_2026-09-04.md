# Guest checkout — 2026-09-04

## Scope

Owner request: remove buyer registration, email verification and organization approval from the end-to-end purchase path. Target: https://nexphaselabs-staging.ammre.workers.dev/. WordPress, DNS, production data and production deployment are unchanged.

The real project is `/Users/ammrebarakat/Developer/nexphaselabs.net`. Implementation and release checks use the isolated `codex/guest-checkout-20260904` worktree at `/tmp/nexphase-reliability.chwLpB`. Changes are synchronized into the real project only after comparing contents; concurrent Claude work is preserved.

## Implemented

- `OPEN_CHECKOUT_ENABLED=true` in staging. Defaults remain closed elsewhere unless explicitly enabled. Consumer account sign-up is a separate switch.
- Anonymous visitors see public list prices and can add a priced pack size to a private cart. No login, institutional domain, organization application, document upload or staff approval is required.
- Guest checkout collects contact email, recipient and US delivery address. Company and phone are optional. Email is not verified or treated as account ownership. The standard research-use/terms acknowledgement remains, as do product quality and stock controls.
- A random, hashed, 30-day guest session uses an HttpOnly/SameSite cookie (Secure on HTTPS). Its internal owner record has `status=guest`, an unusable password, and no verified email. Guest tokens do not grant ordinary account or staff access.
- Cart changes, order submission, order history, cancellation, payment selection and current invoice download are buyer-scoped. A guest must return in the same browser; cross-device order recovery is not included. Losing the cookie does not delete the order record.
- Orders store `contact_email` separately. Migration `0031_guest_checkout.sql` updates the atomic notification trigger to use that contact, not the internal placeholder address. Existing orders retain the old account-email fallback.
- Submitted orders still recheck session validity, current price, exact cart contents and a released lot within the accepting transaction. Price and payment state cannot be supplied by the browser.
- A clearly labeled simulated-payment action is allowed only in explicitly configured staging/development, for the buyer's own pending invoice with its exact `TEST-` reference. It is denied in production, unknown or missing environments. Repeating a completed simulation is idempotent. The confirmation banner requires the stored paid state.
- Header, catalog, product, access, FAQ, checkout and draft policy copy match the new guest path. Optional sign-in has a guest alternative.

## Claude work preserved

Completed invoice/COA work (`ba91411`) and packing slips (`c7e86d9`) are incorporated into the release. Guest invoice download retains ownership checks. Unfinished hazard-label work and migration `0030_exotic_harry_osborn.sql` are not deployed by this release. In the main project, the guest schema column and snapshot are merged around that work rather than replacing its schema, catalog hazard fields, metadata or document changes.

## Verification

- Type checking, lint and staging build: passed.
- Staging deployment dry run: passed; generated bindings show the staging database/bucket and open checkout flag.
- Targeted guest integration tests: 16 passed, using real SQLite behind the D1 interface. Coverage includes guest purchase through staff fulfilment, isolation, revoked/expired sessions, account/staff separation, production simulation denial, idempotence and concurrent offer changes.
- Built-worker HTTP test: passed locally with synthetic product data. Public price, anonymous cart, private cookie, delivery entry, submission, simulated payment, database-backed confirmation, cross-guest denial and cleared cart all passed. Synthetic order `NX-260904-0001`; no money, remote orders, external messages or physical shipments.
- Browser automation timed out under heavy host load; no completed visual/mobile inspection is claimed for this change.
- Full release regression: 452 tests across 43 files passed. Main-project guest/workspace/navigation checks: 24 tests across 3 files passed. The full rerun used one worker and 60-second test/hook timeouts to accommodate host contention; the first default-timeout full run was interrupted after a guest-test timeout (the same test passed standalone and in the final full run).

## Data/configuration still needed

The staging database was inspected: all 16 published active pack sizes have null public and institutional prices. No selling prices were invented or changed. Only BPC-157 currently has a released lot; other materials also need real lot release records before ordering. These are catalog/stock prerequisites, not buyer verification gates.

The owner has been asked for prices. Until supplied, the real catalog remains priced on request and cannot accept purchases. Synthetic prices were used only in the disposable local test database. Staging always simulates payment; real-money payment activation is not part of this release. Draft legal pages remain marked for counsel review.

## Release record

- Staging database backup: private local export at `/tmp/nexphase-guest-e2e.tt6frk/staging-before-guest.sql` (not committed).
- Applied remote migration: only `0031_guest_checkout.sql`. Additive column/notification-trigger changes; previous worker compatibility retained.
- Release commit: `7caf505`.
- Staging version: `107dcda8-cf67-4275-98ac-a08cc1d58a8a`, deployed 2026-09-04 at approximately 15:32 UTC.
- Live smoke checks passed at 15:33 UTC: healthy database/document storage; anonymous cart HTTP 200; no-account access page; product page no longer hides pricing behind verification; staff orders still redirect to staff sign-in; unauthenticated simulation denied (401); cross-origin cart POST denied (403). No remote test orders, guest records, payments or shipments were created.
- Post-deployment data check: all 16 active published pack sizes still have null public and institutional prices. No prices were changed.
- Final type checks passed in both the isolated release and the real main project. The main migration snapshot preserves Claude's settings/hazard fields and adds the guest contact column.
- Local browser automation remained unavailable after repeated timeouts. The successful built-worker HTTP purchase test is the end-to-end evidence, not a claim of completed visual browser inspection.
