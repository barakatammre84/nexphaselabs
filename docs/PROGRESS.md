# Build progress — NexPhase Labs operating system

Source plan: `docs/BUILD_PLAN.md` (artifact "NexPhase Operating System", 2 Sep 2026).
Target: fully operational by **30 September 2026**, no known bugs.

## Loop discipline (Ralph)

For every step, in order, never skipping:

1. **Build** the step.
2. **Check**: `npx tsc --noEmit`, `npm run lint`, `npm run build`, and the
   step's own tests / manual verification (dev server, curl, D1 query).
3. **Audit**: independent code review of the diff for correctness, security,
   and the CLAUDE.md compliance rules.
4. **Fix** everything found.
5. **Re-check** (step 2 again) and **re-audit** (step 3 again) until clean.
6. Mark the step `[x]` here with a one-line note, commit, and only then move on.

A step is not done while any check or audit finding is open.

## Phase 1 — Storage and deployment

- [x] 1.1 Cloudflare Workers deploy config: `wrangler.jsonc`, `@cloudflare/vite-plugin`, build passes — `npm run build` green; built worker served every route under `wrangler dev`.
- [x] 1.2 D1 database created and bound as `DB`; drizzle migrations generated and applied — `nexphase-labs` (prod) and `nexphase-labs-staging`; migration 0000 applied to local, staging and prod and recorded in `d1_migrations`. Lot API verified: released → 200, quarantined → 404, no tables → 503.
- [x] 1.3 R2 bucket created and bound as `DOCS`; private document store helper — `nexphase-documents` (+ `-staging`); `lib/documents.ts` put/get round-trip verified through the worker (PDF stored at `lots/<lot>/coa/<id>.pdf`, served `private, no-store`, attachment).
- [x] 1.4 Staging vs production environments; secrets outside the repo — separate worker/D1/R2 per env in `wrangler.jsonc`; `.dev.vars` git-ignored; `wrangler secret put` documented.
- [x] 1.5 Rollback-capable deploy documented — `docs/DEPLOY.md` (versions list / rollback, backwards-compatible migrations). **Not yet exercised against Cloudflare**: local `wrangler` is unauthenticated; owner must run `npx wrangler login` (or set `CLOUDFLARE_API_TOKEN`) and then `npm run deploy:staging`. Tracked in 6.4.

Audit (Phase 1): independent review CLEAN. Acted on one sub-threshold note by dropping stale-while-revalidate on the lot API (max-age=60, must-revalidate) so a withdrawn lot stops resolving within a minute.

## Phase 2 — Catalog manager

- [x] 2.1 `products` + `product_variants` tables, migration 0001 applied to local/staging/prod; `lib/catalog-rules.ts` validator (lab-solvent + presentation whitelists, forbidden-language scanner, invented-name/blend check, CAS check digit, deterministic SKUs) with 30 vitest tests. Audit: two rounds of findings (anchored name regex, synonyms unscanned, over-broad "condition"/"energy"/"muscle") fixed; final verdict CLEAN. Scanner errs toward false positives ("matrix", imperative "add N mL") — the form shows the reason so copy can be rephrased.
- [x] 2.2 Seed from `lib/catalog.ts`; catalog pages read from D1 — `lib/catalog-data.ts` (published-only reads for public pages), `scripts/seed-catalog.ts` → `drizzle/seed/catalog.sql` (validated through catalog rules, INSERT OR IGNORE), seed applied to local/staging/prod. Home, catalog, product, manage pages are dynamic and read D1; D1 failure renders an explicit "unavailable" state, never stale data (no static fallback, by design). Audit found the index/home cards substituting BPC-157's photo for imageless products; fixed with shared `ProductImage` honest placeholder. Re-audit CLEAN.
- [x] 2.3 Staff sign-in protecting `/manage` — `staff_users` / `staff_sessions` (migration 0002, applied local/staging/prod), PBKDF2-SHA256 hashes, hashed session tokens in HttpOnly SameSite=Lax cookies (Secure on https), same-origin check on the POST handlers, atomic 10-failure/15-minute lockout, generic "invalid" for unknown, inactive and wrong-password. `/manage` layout + page both call `requireStaff`. `npm run staff:create` bootstraps a user (hash-only SQL, git-ignored). `robots.txt` disallows /manage, /staff, /api. OpenAI sign-in code and dependency removed. Verified by curl: CSRF 403, cookie flow, revoke, lockout under 12 concurrent guesses. Audit: three findings (inactive enumeration, counter race, page-level guard) fixed; re-audit CLEAN. **Owner action:** create the production staff user with `npm run staff:create` and apply the SQL to prod.
- [x] 2.4 Product create/edit form with schema rules enforced server-side — `/manage/products/new` and `/manage/products/[code]` (admin + qc only), server action with own same-origin check, every save through `validateProductInput`, writes as one D1 batch, `product_revisions` snapshot (migration 0003, all envs) attributed by name. Verified in the browser: forbidden language refused with named violations; clean edit saved, revision written, public page updated; draft create hidden from the public site. Audit found unscanned fields (molecular weight, exact mass, SMILES, solubility concentration) — now format-checked and scanned; re-audit CLEAN.
- [x] 2.5 Pack sizes and presentations without code changes — pack sizes are lines in the form (`quantity | presentation`), presentations restricted to the laboratory whitelist (no capsule, spray, pen, syringe). Verified: create with two presentations; edit retired one SKU (`active = 0`, never deleted) and added another.

## Phase 3 — Lot intake and release

- [x] 3.1 Lot intake — `/manage/lots` (list), `/manage/lots/new` (intake form), `/manage/lots/[lot]` (staff detail: provenance, analytical record, documents, tests, movement ledger). `createLot` writes the lot (status left to its quarantine default; no status parameter exists) and the receipt movement (actual received date, "Name (staff id)") in one D1 batch. `validateLotIntake`: lot-number pattern, unit-bearing quantities, real-date checks, manufacturer name+address as a pair, forbidden-language scan on public-facing text. Verified in the browser; public lookup returns 404 for the quarantined lot. Audit CLEAN (retest-after-receipt check added on a sub-threshold note).
- [x] 3.2 Document upload to R2 keyed by lot — `lot_documents` history table (migration 0004, all envs), upload form on the lot page, staff upload handler (same-origin + session, PDF/PNG/JPEG ≤ 25 MB), `attachLotDocument` batch (supersede previous → insert → point lot key), staff-only download in any status with private no-store headers. No public document route yet (3.5). Verified by curl: 401/403 gates, upload, wrong type refused, replacement supersedes, download serves the new file. Audit CLEAN; hardened route-param decoding on a sub-threshold note.
- [x] 3.3 Test result capture, one row per test — form on the lot page for QC/admin (`canRecordResults`), `validateLotTest` (type whitelist, method/result/spec rules, analyte for metals/solvents, dates, forbidden-language scan of every public-facing field), `addLotTest` inserts the row and refreshes the derived summary columns in one batch (identity pass only, purity, water, heavy metals rebuilt by SQL group_concat). Rows are never edited or deleted. Status is untouched. Verified in the browser (purity + two heavy metals). Audit: summary race fixed by computing it in SQL; re-audit CLEAN. Note: server-action bound arguments travel in plain hidden fields; no action treats them as authorisation (comments corrected).
- [x] 3.4 Named release / hold / reject / withdraw — `setLotDisposition` is the only code path that changes a lot's status: fresh re-read, release blockers recomputed server-side (manufacturer name+address, COA on file, passing identity test, purity result, no failed tests, quantity remaining), conditional `UPDATE … RETURNING` on the prior status, and a `lot_status_events` row (migration 0005, all envs) written only after the update applied. Transitions: quarantine → release/hold/reject; on_hold → release/reject/withdraw; released → hold/withdraw; rejected/withdrawn terminal. QC/admin only; reasons required and scanned. Verified in the browser: release blocked until identity passed, then released (public 200), held (public 404), re-released (public 200). Audit: batch ordering could have written a false event on a lost race — restructured; re-audit CLEAN.
- [x] 3.5 Public lot lookup with document download — `lib/lots-public.ts` is the single released-only source for the JSON API, the public download route (`/api/lots/[lot]/documents/[type]`, streamed from private R2, `private, no-store`) and a permanent indexable page `/lots/[lot]` with the regulatory statement above the fold. Payload excludes released-by, supplier, storage location, quantities, uploader names, movements and status history. Lookup component shows per-document download links and the permanent link. Verified by curl: released 200 + download, quarantined 404 everywhere, invalid type 404. Audit CLEAN.

Phase 3 ships: a received lot moved quarantine → released through documents, tests and a named decision, and the public lookup resolves it with its documents attached.

## Phase 4 — Accounts and the two tiers

- [ ] 4.1 Accounts + sessions schema; sign-up, sign-in, email verification
- [ ] 4.2 Consumer tier: terms + RUO acknowledgement
- [ ] 4.3 Institutional tier: domain check, no residential shipping, document upload, review queue, approval
- [ ] 4.4 Tier-aware visibility rule (pricing, lot availability, bulk quantities) on the same pages

## Phase 5 — Orders, checkout, payments

- [ ] 5.1 Cart and order schema with `channel` and `authorizationRef` fields
- [ ] 5.2 Checkout with payment-method abstraction (ACH / BTCPay adapters; provider TBD by owner)
- [ ] 5.3 Fulfilment: pick from released lot, decrement, write `lot_movements` shipment row with actual consignee and ship date
- [ ] 5.4 Tracking and order status for the account

## Phase 6 — Books, reporting, launch checks

- [ ] 6.1 Accounting export (QuickBooks-ready CSV/IIF) of orders, cost per lot, shipments
- [ ] 6.2 Reports: inventory on hand by lot, movement history by consignee, revenue by product
- [ ] 6.3 Launch list: terms, privacy, shipping, returns pages; SDS library; entity details on /about
- [ ] 6.4 Final end-to-end verification and no-open-bugs sign-off

## Owner decisions still open (not engineering)

- Payment provider (Stripe/PayPal/Square prohibit this category)
- Whether the consumer tier stays
- SDS set due 20 November 2026
- Entity, insurance, in-house filling
- GLP-1s: recommendation is no

## Log

- 2026-09-02: Plan pulled from artifact and saved. Baseline: typecheck and lint pass; `npm run build` fails on unresolved `cloudflare:workers` (no Cloudflare Vite plugin / wrangler config). Cloudflare account has no D1, no Workers, one unrelated R2 bucket. Local `wrangler` not authenticated.
