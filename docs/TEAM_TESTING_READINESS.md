# NexPhase Labs — catch-up and team-testing readiness

Assessment date: 3 September 2026. Code inspected: `main` at `c437951`.

## Executive assessment

This is now a database-backed research-supply operating application, not just a website prototype. Catalog management, lot quality control, institutional accounts, ordering, payment orchestration, fulfillment, and reporting are implemented. The next useful milestone is a protected, isolated environment in which the team can validate those workflows. A storefront rebuild is not a prerequisite.

The active checkout is `/Users/ammrebarakat/Developer/nexphaselabs.net`. The previous Documents/ChatGPT folder is empty. The private GitHub repository is `barakatammre84/nexphaselabs.net`. After fetching, this checkout was **27 commits ahead of origin/main and zero behind**. Deploying the existing GitHub branch without first publishing the intended local commits would omit substantial work.

This assessment distinguishes implemented code from remote configuration and operational readiness. Prior progress notes record manual workflow checks and remote migration applications; those historical claims do not establish the current remote state. No public-site change, remote deployment, GitHub push, or infrastructure creation was performed during this assessment.

## What is built

| Area | Implemented capabilities | Important boundary |
| --- | --- | --- |
| Public website | Homepage, catalog, product detail, lot lookup, SDS library, account entry points, about/FAQ/legal pages | Actual product data, photographs, documents, and legal approval remain owner responsibilities |
| Catalog management | Product create/edit, pack sizes, tier prices, publication state, chemical classes, ordering/featured selection, images and SDS uploads, revision histories | Products are data; routine catalog updates do not require code changes |
| Staff administration | Admin/QC/operations roles, sign-in, forced first password change, role/account management, session revocation, audit events | First administrator must be securely bootstrapped in each new environment |
| Quality and inventory | Quarantined lot intake, provenance, analytical documents, test results, release/hold/reject/withdraw decisions, movement history | Retest policy, correction workflow, and operational alerts need more work |
| Customer accounts | Email verification, password reset, versioned acknowledgements, institutional applications and review, suspension/reinstatement | Consumer tier is disabled; enabling its flag alone does not enable consumer ordering |
| Orders and payments | Server-validated cart/pricing, institutional shipping snapshot, idempotent order submission, bank-transfer/BTCPay adapters, fallback invoice, manual payment confirmation | No verified live card processor; external payment configuration is not established by passing tests |
| Fulfillment | Released-lot selection, quantity validation/decrement, shipment records, tracking links, customer history, consignee traceability | Tracking is entered manually; no carrier-label purchase or live shipping rates |
| Reporting | Inventory, revenue/margin, movement/consignee reports, accounting-oriented CSV exports | CSV export is not a live QuickBooks connection or a general ledger |

## Checks performed in this assessment

- `npm run check` passed: TypeScript, lint, **110 tests in 15 files**, and the production build.
- `docs/BUYING_FLOW_BASELINE.md` now defines the repeatable customer buying-flow baseline. `npm run baseline:store` uses only explicit GET requests and covers health, browsing, anonymous pricing visibility, account access, cart protection, and the checkout eligibility boundary.
- All **21 migrations (0000–0020)** applied successfully to a fresh, isolated local D1 database. Class and catalog seeds then applied successfully.
- Seeded database contained 27 business tables, three chemical classes, and five published products. Seed products are BPC-157, beta-NAD+, GHK, GHK-Cu, and Selank; this is not a claim about the current production catalog.
- The built Worker served the homepage, catalog, SDS library, customer sign-in, and staff sign-in with HTTP 200 against that fresh database.
- Unauthenticated `/manage` redirected to staff sign-in; an unknown lot returned 404.
- GitHub has no Actions workflows configured in the inspected repository.
- Local Wrangler was not authenticated. Current remote database migrations, bucket contents, secrets, and deployed version were **not verified**.

These are unit/build/database/HTTP checks, not a new comprehensive browser-based acceptance test or a guarantee of security/compliance. The temporary smoke-test server was stopped after checking it.

## Remaining planned engineering

The source of the implementation checklist is `docs/PROGRESS.md`. Phases 1–6 and 7.1–7.3 are marked implemented; the remaining planned features are:

1. **7.4 — Lot corrections and alerts:** supersession-based corrections; retest due, quarantine aging, low stock, and missing SDS alerts.
2. **7.5 — Refunds and returns:** record refunds with references, quarantine received returns, and include them in exports. Today cancellation may mark a payment `refund_due`; that is not a completed refund.
3. **7.6 — Procurement:** suppliers, purchase orders, expected receipts, and landed cost connected to intake.
4. **7.7 — Operations dashboard:** work queues, counts, unified audit timeline, optional daily digest. The current manager landing page is a catalog table.
5. **7.8 — Deployment automation:** CI, staging delivery, controlled production release, and migration steps.

These features can be developed while internal testing proceeds. Refund handling and inventory policies must be resolved before relying on the app for real paid operations.

## Additional readiness gaps observed in code

- **Shipping and tax:** order creation currently supplies zero shipping to the totals calculation. The order schema has no tax calculation/amount field. This must be an explicit test limitation, not mistaken for finished commerce behavior.
- **Stock policy:** order submission requires a released lot but does not reserve inventory or guarantee sufficient stock across pending orders. Fulfillment checks quantities; decide backorder/reservation behavior before real sales.
- **Retest dates:** recorded dates are not enforced as release/shipment blockers. Decide the actual rule before operational use; alerts alone may not be sufficient.
- **Email reliability:** ~~Resend is integrated, but staging/production need working credentials. Some order/fulfillment callers do not act on a failed email result; no durable outbox/retry mechanism was evident.~~ **Corrected 16 Sep 2026:** a durable outbox does exist — migration `0029_notifications.sql`, `lib/notifications.ts` — with leases, exponential backoff, an 8-attempt budget and a staff triage desk at `/manage/notifications`. Google Workspace (Gmail API) is now the primary provider and Resend the fallback. Two things in the original note still hold: account mail (verification, password reset, organisation decisions, digest) still goes through fire-and-forget `lib/email.ts` with no retry, and **production holds no email credentials at all**, so the live app cannot send.
- **Safe testing:** ~~there is no explicit environment-wide test-payment lock or recipient allowlist.~~ **Corrected 16 Sep 2026:** a recipient allowlist exists and is enforced — `lib/environment-safety.ts` requires an exact `TEST_EMAIL_ALLOWLIST` match outside production, applied in `lib/email-provider.ts` so it covers both send paths; empty denies everything and wildcards are not accepted. Payments are separately locked by `ZELLE_MODE=manual`, under which no inbound receipt can mark an order paid without staff review.
- **Access and indexing:** staff authorization protects staff screens, not the entire website. Staging requires an outer access gate. Current robots behavior permits public pages; add staging-specific indexing prevention as defense in depth, not as access control.
- **Operations:** add readiness monitoring and validate deployment rollback and data recovery. A Worker rollback does not roll back the database.
- **Content:** replace remaining marketing renders with accurate supplied-material photographs, upload actual supporting documents, and complete counsel review before public launch. A disclaimer does not independently establish permission to sell a product.

## Hosting decision: Railway versus a Railway-style testing URL

### Existing NexPhase architecture

React 19 + Vinext + Cloudflare Workers, with Drizzle over D1 and documents/images in R2. The database, document, configuration, email, and payment code access Cloudflare runtime bindings.

`wrangler.jsonc` already describes separate staging and production Workers, databases, and buckets. The staging `PUBLIC_ORIGIN` is a placeholder and must be replaced with the actual assigned host. Configured resources are not proof that they currently exist or are up to date.

`npm start` launches **Wrangler's local development runtime**, not a Railway-ready production Node server. A Railway service configuration alone will not provide D1/R2 bindings.

### Realiquity comparison, inspected read-only

Railway has a separate **Realiquity Staging** project containing an app service and Postgres, with a Railway-generated URL, a migration pre-deploy command, and `/healthz` monitoring. NexPhase has no Railway project in the connected account. Realiquity's useful pattern is environment isolation and controlled external effects, not a directly reusable runtime configuration.

### Confirmed hosting decision

On 3 September 2026, the owner confirmed that NexPhase will **stay on Cloudflare** and requested that the accumulated local work be committed and synchronized to GitHub. No Railway migration is planned. The architecture comparison below explains this decision.

For the fastest path to internal testing, use the existing **Cloudflare staging architecture**, protected by Cloudflare Access. It provides a shareable team URL without changing the live domain and preserves the working D1/R2 integrations. Access should cover all staging entry points, including applicable preview URLs; a preview that shares production bindings is not an isolated test environment.

Moving to Railway would require a deliberate hosting migration: establish a supported production runtime, adapt database access/migrations and object storage, preserve transactional inventory/authentication guarantees, and rerun the full workflow tests. That work is outside the selected Cloudflare staging path.

Official references:

- [Cloudflare Worker-level Access protection](https://developers.cloudflare.com/workers/configuration/cloudflare-access/)
- [Cloudflare Wrangler environments](https://developers.cloudflare.com/workers/wrangler/environments/)
- [Cloudflare preview URL behavior](https://developers.cloudflare.com/workers/versions-and-deployments/preview-urls/)
- [Railway environments](https://docs.railway.com/environments)

## Private testing release gates

Before distributing a tester URL:

1. Confirm the hosting choice and approved tester email addresses. Do not put credentials in chat or source control.
2. Publish only the reviewed intended commits to the private repository. Preserve unrelated untracked work, including the existing `docs/content/` directory.
3. Verify genuinely separate database, object storage, credentials, and public origin. Never seed test users/orders into production.
4. Protect the whole staging site with an identity/access gate before sharing it. Verify denial for an unauthorized visitor and coverage of alternate hostnames.
5. Apply migrations to the isolated database; load a small, clearly labeled test catalog/lot set and synthetic organizations. Do not copy real customer data unnecessarily.
6. Bootstrap a staging administrator, require password change, and issue separate named QC/operations accounts.
7. Configure verification/reset email to controlled tester recipients and verify that links return to staging. Disable real payment effects and clearly mark simulated/manual test payments.
8. Add a visible staging banner and indexing prevention; check origin/cookie/CSRF behavior behind the chosen access gate.
9. Run the acceptance flow below on the deployed environment. Check logs without logging passwords, tokens, or sensitive application documents.
10. Record the deployed commit, migration state, rollback procedure, and a tested recovery path. Assign an owner to collect and triage tester findings.

## Team acceptance script

Use only synthetic data, non-production documents, controlled inboxes, and simulated payments.

| Tester | Scenario | Expected result |
| --- | --- | --- |
| Unauthorized visitor | Open the staging hostname and alternative/preview entry points | Access denied before reaching the app |
| Administrator | Create QC/operations staff; reset/deactivate a test staff account | Forced password change, correct role boundaries, revoked sessions, attributed audit events |
| Catalog/QC | Add a draft product with variants; upload photo/SDS; publish and edit it | Draft hidden, published content correct, catalog updates without code edits, history retained |
| QC | Receive a lot; attempt premature release; upload documents/tests; release then hold | Release blockers work; only released lots/documents are public; hold removes public access |
| Customer + administrator | Sign up, verify email, submit an organization, request information, then approve | Correct emails and state changes; pricing/order access gated until approval |
| Customer service | Reset password, reuse reset token, suspend/reinstate account, revoke approval | Single-use links, session revocation, proper ordering/visibility restrictions |
| Customer | Create cart, submit twice, choose test payment flow | Server-derived prices, one order, staging-only effects, explicit shipping/tax limitation |
| Operations | Mark test payment, fulfill from released stock, submit shipment twice | One shipment/decrement, correct units and consignee, no duplicate ledger movement |
| Customer + administrator | View tracking and download reports/CSVs | Correct order/lot links, stock balance, revenue/cost attribution; no private operational data in public lot output |
| Administrator | Cancel a paid test order | `refund_due` is visible; team understands refund completion is not built |

Capture each finding with role, URL, steps, expected/actual result, screenshot if useful, and the deployed commit. Do not include passwords or reset links in bug reports.

## Current handoff status

Code catch-up, automated checks, fresh local migration replay, and HTTP smoke testing are complete. Cloudflare is the confirmed hosting target. Private staging deployment is **not complete**; next steps are Cloudflare authentication, verification of isolated staging resources, access protection, and the testing release gates above.

GitHub synchronization should happen at completed, verified milestones rather than allowing many phases to accumulate locally. Each synchronization should check repository status, stage intended files explicitly, exclude credentials/local state, commit, push without force, and confirm the local and remote commit IDs agree. A GitHub push is not itself authorization to deploy to the public site. The COA article under `docs/content/` remains an unpublished draft even when backed up in the private repository.
