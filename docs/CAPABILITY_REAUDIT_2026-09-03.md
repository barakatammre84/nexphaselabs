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
