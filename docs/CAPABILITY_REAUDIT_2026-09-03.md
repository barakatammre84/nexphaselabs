# Capability re-audit — 3 September 2026
Status: targeted hardening pass, not a business-launch sign-off.

## Correct project and current work
- Application checkout: /Users/ammrebarakat/Developer/nexphaselabs.net.
- Private repository: barakatammre84/nexphaselabs.net.
- Test deployment: https://nexphaselabs-staging.ammre.workers.dev.
- Baseline: 0b64c79. Read-only remote check found origin/main at that commit.
- Shared checkout advanced to b0775ab (Phase 8 plan) during the audit. Claude is actively implementing document infrastructure, migration 0028, PDF rendering and issued-document storage. Those files are **work in progress**, not missing features to rebuild.
- WordPress/public DNS are out of scope and unchanged. No production deployment is authorized by this audit.
- Historical TEAM_TESTING_READINESS.md predates completed Phase 7 features; its feature checklist is not current.

## Existing capabilities — retained, not rebuilt
| Phase | Implemented and inspected | Remaining verification or decisions |
| --- | --- | --- |
| 1: deployment/storage | Workers, isolated staging D1/R2, migrations, rollback instructions, deployment workflows | Recovery rehearsal and protected tester access remain unverified. Staging is already deployed, contrary to older notes. |
| 2: catalog | Data-managed products, classes, variants, pricing, images, SDS, revision history | Real supplier material/document evidence and publication approval are outside automated checks. |
| 3: quality/inventory | Quarantine intake, tests, lot documents, named decisions, corrections and movement history | Transaction defects fixed below. Retest enforcement and exception/countersignature policy still need confirmed operating rules. |
| 4: accounts | Email verification, institutional applications, approval/revocation, acknowledgements, gated prices, account service | Authentication races fixed below. Deployed email delivery is not configured. |
| 5: orders/fulfillment | Idempotent order submission, payment adapters, picking, shipment ledger and tracking | Shipping is explicitly zero; no tax amount field. No inventory reservation. Email failures are not durably retried. These are not missing order-management features, but unresolved commerce/reliability gaps. |
| 6: reporting | Lot cost, inventory and consignee reports, revenue/refund attribution, CSV exports | CSV export is not an exercised bookkeeping integration or reconciled close. No accounting policy inferred. |
| 7: operating tools | Staff/admin tools, customer service, corrections/alerts, refunds/returns, procurement, dashboard/activity/digest and CI/deploy | Preserve these completed implementations. Role-to-charter mapping and a complete deployed team rehearsal remain separate acceptance work. |
| 8: issued documents | Claude's implementation is actively in progress in the shared checkout | Do not duplicate, remove, or deploy incomplete concurrent work. Reconcile again after its milestone. |

## Repeated audit → fix → regression-test results
| Capability | Before | Fix and acceptance evidence |
| --- | --- | --- |
| Deployment health | SELECT 1 could succeed against an empty or outdated database; no document-store probe | Read-only probes cover every table/column and R2 access. Fresh migration replay, missing-column and unavailable-bucket tests. No business rows or secrets returned. |
| Safe testing | Staging could use copied real payment credentials or email arbitrary recipients | Only explicit production enables live payment rails/links/webhooks. Non-production uses simulated payment and an exact email allowlist. Test banner and robots exclusion added. This is not an access-control gate. |
| Named quality decision | Status update and audit insert were separate commits | One atomic batch; an audit failure rolls back the decision. Tests simulate audit failure and stale concurrent evidence. |
| New analytical results | A released lot could receive failed evidence and remain sellable | Staff must hold the lot before recording new results; a new release decision then applies existing blockers. Conditional write prevents a concurrent release/correction bypass. |
| Lot documents/cost | Stale corrected records could produce false document/cost history | Conditional claims guard the pointer and attributed history; stale writes fail without false events. |
| Correction history | Family traversal stopped at 50 versions | Full cycle-safe traversal; tests cover 56 versions and a corrupt cycle. |
| Reset-token single use | Timestamp-based guard let a losing same-second request overwrite the winning password | Unique account claim guards password, session revocation and audit event. Regression simulates the losing claim in the same second. |
| Authentication | Sign-in could create a session after a password change or deactivation won concurrently | Conditional session creation rechecks credential, active status, revocation marker and lockout. Customer/staff regression tests. |
| Email verification | A token revoked between read and write could still activate an account | Atomic unused/unexpired claim and account-status check. |
| Order idempotency | Collision recovery queried by token without its account owner | Recovery now includes account ownership. |

## Boundaries of the evidence
- Baseline checks passed: typecheck, 139 unit tests, and production build; two unused imports removed.
- New integration tests use a real, fresh in-memory SQLite database behind the D1 interface and replay all migrations. They test generated SQL and transaction rollback, not canned database replies. They do not replace a complete Cloudflare browser rehearsal.
- At inspection, staging had all 28 baseline migrations, 3 staff, 1 customer account, 1 lot and 0 orders. These are counts only, not confirmation that business data is complete or all records are synthetic.
- Both deployed Workers returned empty secret-name lists. No secret values were read or printed.
- No payment provider, email recipient, tax rate, legal approval, quality specification, staff authority or shipping policy was invented.
- The separate release snapshot excludes Claude's incomplete Phase 8 files and does not apply its migration.
- Whole-business readiness is **not complete**. Passing code tests cannot establish live supplier qualification, insurance, legal approval, actual product documents or payment settlement.

## Next execution order
1. Finish and publish this tested hardening milestone to staging; verify database/document health and unauthenticated routes without creating customer communications or payments.
2. Reconcile Claude's completed Phase 8 milestone, then rerun the same tests against the integrated tree.
3. Agree shipping/tax handling before implementing a quote step or provider integration; do not silently charge zero as a finished policy.
4. Add durable transactional notification retries, then reservation/backorder rules and their concurrency tests.
5. Verify finance exports/reconciliation and role/quality exception workflows against approved business rules.
6. Run the full supplier → lot → institution → order → simulated payment → shipment → return/refund → reports rehearsal on staging with named testers.

The process-optimization skill guided the handoff and bottleneck comparison. Cloudflare guidance guided isolation and dependency checks. Neither constitutes regulatory or accounting sign-off.

## Verified staging release
- Source snapshot: local branch codex/reliability-audit-20260903, commit 7a73f24.
- Staging Worker version: d6367cf4-9175-4ca7-ac02-680d3f159dea, deployed 4 September 2026 UTC (3 September Pacific).
- Final checks: 165 tests in 24 files, typecheck, lint and production build passed. Staging build and deployment succeeded.
- Live smoke checks: health returned 200 with db=ok and docs=ok; home/catalog/staff sign-in returned 200 and the test banner; /manage redirected to sign-in; unknown lot and staging payment webhook returned 404; robots disallows all staging indexing.
- No database migration was required or applied by this release. No data, accounts, credentials, WordPress configuration or DNS were changed.
- The reliability edits are ALSO present in the shared development checkout alongside Claude's separate Phase 8 work. Do not blindly cherry-pick them into that dirty checkout; review the shared diff when integrating the next milestone. The isolated release commit preserves the exact tested code.
- Dependency installation reported 14 advisories (6 moderate, 8 high) in the baseline dependency tree. Detailed advisory triage is outstanding; this is not a security-clearance claim. Dependencies were not upgraded while Claude was changing package files.

## Continued capability loops — 4 September 2026 UTC

This section supersedes the initial gap/status snapshot above. Whole-business readiness is still not signed off.

### Correct-project reconciliation
- Claude committed Phase 8.1 as 7b23514. Its document foundation (entity block, layout/rendering, immutable issued-document storage and staff download) is preserved in the release snapshot.
- Claude's new COA implementation is actively changing the shared checkout: coa-content/coa modules, lot COA routes, lot page, document access and rendering/storage refinements. These are concurrent work, not missing capabilities to rebuild. They are not included in this release unless already in the committed 8.1 foundation.
- All changes from this pass are integrated into the actual application checkout under /Users/ammrebarakat/Developer/nexphaselabs.net. No files in Claude's active COA work were overwritten. Do not blindly cherry-pick the isolated commits over this shared tree.

### Audit → fix → re-audit evidence
| Capability | Confirmed gap and fix | Verification |
| --- | --- | --- |
| Order/customer handoff | Direct email failures could disappear after the business event committed. Order-event trigger now creates a durable notice atomically; staff see failures on the dashboard and an admin-only notification queue. | Real-SQLite rollback tests; competing dispatcher, frozen-payload retries, expired lease recovery, provider rejection/uncertainty, 23-hour/eight-attempt stop and attributed handling tests. |
| Operational notification handling | No recoverable failure queue or clear distinction between provider acceptance and customer receipt. | Local browser: sign-in → dashboard warning → failure queue → note → handled separately → attributed history. No real email sent. Runbook: NOTIFICATIONS_RUNBOOK.md. |
| Scheduled processing | Needed a real runtime check in addition to mocked provider tests. | Built handler ran in local workerd. Local assets-router scheduled forwarding failed in the pinned tooling; direct-handler smoke passed and processed a synthetic pending notice into attention with zero provider attempts. Live Cloudflare cron later completed successfully, with no exceptions and count-only logs. |
| Shipment/return dates | A 24-hour tolerance admitted tomorrow's shipment/return and the day before shipment as a return date. | Reject future calendar dates, shipment before order submission, and return before shipment; regression tests. Empty-line shipments are rejected clearly. |
| Refund boundary | Direct service calls could record negative, zero, fractional or NaN amounts, or a blank reference; only the form applied validation. | Service rejects invalid cents/references. Concurrent refund attempts produce one recorded refund, not two. |
| Shipment ledger | Needed evidence beyond pure quantity rules for competing updates and partial failure. | Payment → pick → shipment → partial return → refund scenario; stock conserved, returns never replenish sellable stock, five notices recorded. Held/changed lots, duplicate shipment and failed notification insert cannot leave partial stock/line/history writes. |
| Checkout acceptance | Account/session approval, ship-to, price, pack, cart or released-lot status could change after review but before the order was accepted. | One guarded acceptance statement rechecks all reviewed inputs; dependent order lines, history and cart clearing only happen after acceptance. Fourteen concurrent-change regressions preserve the cart and produce no orphan rows. Overlapping identical submissions return the same order. |
| Shipment eligibility | Revoking institutional approval after ordering did not itself prevent shipment. | Current account/institution eligibility checked before picking and again in the atomic stock claim. Suspension or revocation winning during picking causes no shipment or stock movement. |
| Query capacity | Expanding one bound value per reviewed field/lot can exceed D1's 100-parameter limit; a 100-message history query also risked exceeding it. | Snapshot comparisons and notification-ID lookup use a bound JSON array. SQLite D1 adapter now enforces 100 parameters. Full 20-line cart and 20-distinct-lot shipment tests pass. [Cloudflare D1 limits](https://developers.cloudflare.com/d1/platform/limits/). |

### Releases and verification
- Notification/date/refund milestone: isolated commit 5b0f839, staging version ac06e291-ae10-4fa6-ae3a-df1b91cb571a.
- Applied only staging migrations 0028 (Claude's document foundation) and 0029 (notification queue/history/trigger). No historical notice backfill. Immediately before migration staging had zero orders and no configured secret names.
- Checkout/eligibility/capacity follow-up: isolated commit 371ccfd, staging version e36fbf67-360c-4435-adde-937f5088336b. No additional migration.
- Release snapshot: 265 tests in 30 files, typecheck, lint and staging build pass.
- Integrated shared project, including Claude's current additional tests: 290 tests in 31 files, typecheck and lint pass. This is not a claim that unfinished COA routes were deployed.
- Live cron proof on the first notification milestone: outcome ok, no exceptions; accepted=0, retrying=0, attention=0, skipped=0. The same schedule remains configured in the follow-up.
- WordPress, DNS and production remain unchanged. No provider credentials, tester permissions, live payments, customer emails or real shipments were created.
- Package advisory detail retrieval failed with a bounded registry timeout. Previously observed advisories remain unresolved; no security-clearance claim.

### Remaining core gaps and execution gates
1. **Order commercial approval:** decide whether stock, shipping and tax are approved by staff before payment, or which configured service calculates them. Current zero shipping/no tax field is not treated as a finished policy. A clarification was sent; no policy answer has arrived.
2. **Inventory commitments:** reservation, expiry and backorder rules are still absent. Preventing negative stock at shipment does not reserve inventory for an unpaid or paid order. Implement alongside the chosen approval/payment workflow, then test competing orders and held/expired lots.
3. **Payment/provider lifecycle:** live provider setup and settlement/cancellation/late-payment recovery require an approved rail and test configuration. No real credentials were configured. Existing simulated rails remain available only for testing.
4. **Communications:** configure the permitted sender and approved tester allowlist, then rehearse actual provider acceptance/delivery. Non-order emails (account verification/reset, institutional decisions and digest) remain outside the new durable queue; authentication tokens deliberately never enter it.
5. **Phase 8 documents:** continue from Claude's COA milestone, then verify invoice, packing slip and label/HazCom workflows against actual approved entity/material evidence. Preserve concurrent work and re-audit the integrated milestone; do not call the foundation the whole document phase.
6. **Quality authority:** confirm retest-date enforcement, exception/countersignature rules and exact role-to-authority mapping. Existing named release, quarantine and immutable histories are retained; no approval policy was invented.
7. **Finance/recovery/whole-team rehearsal:** exercise reconciliation against representative settled/refunded orders, recovery from a backup, and the supplier → receipt → release → institution → order → simulated payment → shipment → return/refund → reporting/document chain. Confirm deployed plan limits for worst-case multi-lot batches; per-query bind tests do not establish a billing-plan query budget.

Runbook/process/frontend skills shaped the repeatable handling and verification steps; they do not establish regulatory, accounting or business-launch approval.

## Purchasing, payment recovery and report re-audit — 4 September 2026 UTC

This pass continued from the actual application and Claude's existing Phase 8.1, without replacing the in-progress COA files. It does not mark every business capability complete.

### Completed fix → re-test → re-audit loops
| Handoff | Before | After and evidence |
| --- | --- | --- |
| Supplier review → purchase order | Eligibility and identity could change before the order committed; draft sending did not recheck qualification. | Guarded creation checks supplier approval/active status/revision/name and product name/withdrawal. Dependent lines/events require the accepted parent. Sending rechecks eligibility; cancellation remains available. |
| Supplier editing → qualification | A stale form could overwrite a newer edit, or approve evidence that had changed. | Revision-guarded edits and decisions, with no false history on a lost race. |
| Expected receipt → intake | Cost edits could make automatic landed-cost allocation stale; loading all open POs failed above 100 bound IDs. | Intake rechecks allocated cost, quantities, product and order state. One bound JSON array handles order IDs. Single-line lookup no longer loads every open receipt. Verified with 105 open POs. |
| Intake/correction → inventory | A withdrawal could race intake; cancelling/closing an order could race quantity correction and reopen its line. Tomorrow's receipt date was accepted. | Guarded intake for both PO and non-PO receipts, atomic parent/line checks on corrections, disposition recheck and calendar-date validation. Partial receipt/correction tests preserve cost, quantities and quarantine. |
| Provider settlement → cancelled order | Late settlement was acknowledged without recording money received; transient state conflicts could receive a successful HTTP acknowledgement. | Matched late settlement stays cancelled, records payment and a refund obligation, queues one notice, and never authorizes shipment or sends funds. Duplicate deliveries are harmless, replacement invoice references are rechecked, transient failures request retry. Signed webhook must match the configured store. |
| Refund review → recording | Amount owed could change between review and commit. | Refund recording now checks the reviewed obligation as well as prior refunds. Provider requests have bounded waits; raw provider error bodies are not logged. |
| Operational reports → reconciliation | Export margin did not distinguish gross from net of refunds; total, shipping and remaining refund obligation were absent. | Explicit gross/net columns; order total, shipping and outstanding refund printed once per order. Tests reconcile a partial return, refund shares and lot costs; cancelled orders remain outside the sales summary. |

- Added 38 regression cases: 22 purchasing/receiving, 11 payment recovery and 5 reporting.
- Release snapshot: 303 tests across 33 files; typecheck, lint, staging build and deployment dry run passed.
- Integrated shared project including Claude's current COA tests: 328 tests across 34 files; typecheck and lint passed.
- No schema migration, provider call, payment, email, shipment, credential change or production/DNS/WordPress change was needed for these checks.
- Export compatibility note: the old `Margin` header is now `Gross margin before refunds`, and four reconciliation columns are appended. Review downstream import mappings; this is an operational CSV, not a certified accounting import.
- Runtime assumptions were checked against [Cloudflare's D1 transactions](https://developers.cloudflare.com/d1/worker-api/d1-database/) and [limits](https://developers.cloudflare.com/d1/platform/limits/). Settlement semantics were checked against [BTCPay's integration guide](https://docs.btcpayserver.org/Development/ecommerce-integration-guide/) and [webhook API](https://docs.btcpayserver.org/API/Greenfield/v1/).

### Re-evaluated next work — not hidden behind a “complete” label
1. Payment invoice creation still needs durable claim/reconciliation for concurrent requests and uncertain provider responses. The cancellation/settlement fixes above do not solve an invoice created externally before its reference is saved. Keep live acceptance off until this lifecycle is implemented and rehearsed.
2. The stock/shipping/tax approval and reservation decisions remain unanswered. The system still must not treat zero shipping or absent tax as an approved commercial policy.
3. Continue Claude's document milestone, then issued invoices, packing slips and approved labels. Do not redeploy unreviewed COA work or overwrite it.
4. Remaining operational gates from the preceding section still apply: non-order email recovery/configuration, role and retest policy, backup restoration, provider reconciliation and the named-team staging rehearsal.
5. Reports currently read the complete history in memory. Before material volume grows, add bounded date filters/pagination and measure response size; the 105-PO parameter fix is not proof of unlimited report capacity.

The process-review skill guided the repeated handoff checks, and Cloudflare/Wrangler guidance guided the isolated staging verification. No business or regulatory approval is implied.

### Long-history follow-up
- Re-audit found the same bound-parameter limit in lot audit history, release evidence checks, document replacement, heavy-metal summaries and public analytical results. Converted these family lookups to one bound JSON array.
- Expanded the existing correction-chain regression to 111 versions. It verifies full staff history, heavy-metal test recording, document replacement, named release and public analytical results; quarantine remains hidden and public records omit movements, release actor and stock quantities. Cycles still terminate.
- First release of the purchasing/payment/report changes: commit dcc1031, staging version cc95167d-78ad-48e5-b9b4-54b3b0445a29. Live health passed; procurement required sign-in and live payment webhook remained disabled.
