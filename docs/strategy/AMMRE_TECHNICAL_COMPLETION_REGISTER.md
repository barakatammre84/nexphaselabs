# Ammre technical completion register

Reviewed 14 September 2026 against the live staging Worker, Cloudflare resources,
GitHub settings, the current application checkout, and chapters 1, 10, 11, and 16
of the launch register.

This is the execution order for Ammre's technical work. It separates code that
still needs to be built from configuration, rehearsal, and evidence. A feature
being present in source does not close a control until the intended environment
is running it and the evidence is linked in `/manage/controls`.

## Current technical baseline

- `main`, `origin/main`, and the reviewed release branch agree at `c756f44`.
  Typecheck, lint, all tests, the production build, and the staging deployment
  passed in GitHub Actions.
- Staging runs that commit and is healthy. Public pages return `200` with
  `noindex`; staff pages and private APIs retain their own login boundaries.
- Staging and production migrations through `0059` are applied. The production
  Worker is reachable only at its workers.dev origin; the public domain still
  serves the existing WordPress store.
- GitHub now has `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_API_TOKEN`, and
  `STAGING_URL`, so staging deploys from CI. The repository's current GitHub
  plan rejected required environment reviewers; production therefore retains
  the tag-only release guard but lacks the intended second approval.
- Staging has the exact Chase enrollment values in reviewed configuration, but
  manual mode replaces them at checkout with unmistakable synthetic values.
  The Gmail receipt-reader credentials are still absent.
- Mail MX is working through Google Workspace. SPF, DKIM, and DMARC are absent.
- Neither R2 bucket has a bucket-lock rule. The default multipart-abort lifecycle
  rule is the only lifecycle rule.
- The public nameservers are Cloudflare `addyson` / `zac`. The visible zone in
  the current account is pending, assigns `cesar` / `marlowe`, and contains
  stale imported mail records. The active authoritative account must be located
  and reconciled before any DNS change.
- Production has no released inventory. Customer checkout must remain off the
  public domain until real lots are entered, documented, and released.
- The operating-control register has all 30 rows assigned: 14 `in_progress`, 16
  `not_started`, 0 with an evidence link, and 0 ready.

## Execution status for the first production gates

| Order | Status on 14 September 2026 | Evidence or remaining work |
| ---: | --- | --- |
| 1 | Complete | The staging workflow proves the approved public/private boundary and `noindex`. |
| 2 | Complete | Release tree is clean; checks and build pass without a lint warning. |
| 3 | Partial | CI has the Cloudflare credentials. Required reviewers are unavailable on the current GitHub plan; the tag-only production guard remains. |
| 4 | Complete | Reviewed source is on `origin/main`; staging deploys through GitHub Actions. |
| 5 | Partial | Safe manual Zelle simulation is configured and tested. Dedicated Gmail read-only receipt ingestion and the approved Chase QR remain open. |
| 6 | Partial | The current build passed a complete synthetic guest Zelle order, staff review, fulfillment, label/void, shipment, delivery, return, and refund. See [the rehearsal record](../operations/STAGING_ORDER_REHEARSAL_2026-09-14.md). External customer email and the live Gmail receipt path remain open. |
| 7 | Open | Identify the active Cloudflare zone, preserve Google MX, then add and prove SPF, Google DKIM, and monitoring-mode DMARC. |
| 12 | Partial | Staging D1 exported to a checksummed 249,338-byte archive and restored in isolation: 60 tables, integrity `ok`, no missing required tables, and no foreign-key violations. R2 copy and isolated restore remain blocked on the separate recovery credentials. |

## Ordered work

| Order | Register item(s) | Kind | Ammre action | Complete when |
| ---: | --- | --- | --- | --- |
| 1 | `c16-protect`, `c16-new-1`, `access.staging` | Fix + register correction | Reconcile the owner's public-staging decision with the code and register. Change the staging workflow's final check so intentional open mode expects public pages to return `200` with `noindex`, while staff pages and private APIs still require their application login. Replace the stale control note that says a Basic-auth password is required. Do not mark the old “restricted to approved testers” wording ready; revise it or record an explicit waiver. | A workflow test proves the public/private boundary, the deployment job accepts the approved open mode, and the control describes the environment that actually exists. |
| 2 | current release branch | Fix | Finish the uncommitted legacy product-route and redirect correction, add its route regression test, remove the unused-import lint warning, and leave the working tree clean. | `npm run check` passes with no warnings and `git status` is clean. |
| 3 | `c16-new-2`, `c16-tagonly` | Configuration | Create a narrowly scoped Cloudflare API token for Workers Scripts, D1, and R2 on the NexPhase account; add it to GitHub as `CLOUDFLARE_API_TOKEN`. Confirm the production GitHub environment has a required reviewer. | `gh secret list` shows the token by name, a staging workflow can authenticate, and production still requires the tagged release plus reviewer. |
| 4 | `c16-merge` | Release hygiene | Merge the reviewed branch into `main` and push the eleven local commits plus the finished route correction. Use the automated workflow after item 3; stop relying on laptop-only releases. | `main`, `origin/main`, and the reviewed commit agree; CI is green. |
| 5 | Zelle staging readiness; supports `c11-rails` | Fix + configuration | Add the exact Chase recipient name and `ZELLE_MODE=manual` to staging vars. Configure the dedicated Gmail read-only OAuth grant, licensed mailbox, verified Chase sender address, and official Chase QR asset. Keep the transactional Gmail token send-only. | Wrangler reports no missing inherited Zelle vars, the Zelle desk shows configuration healthy, a bounded mailbox sync succeeds, and no receipt can mark an order paid without staff review in manual mode. |
| 6 | latest staging release | Deployment + verification | Deploy the reviewed `main` build to staging through GitHub Actions. Exercise public browsing, researcher sign-up, terms/age acknowledgement, cart, address, order, customer email verification, pinned documents, Zelle claim, staff payment review, fulfillment, Shippo test label/void, delivery, return, and refund. | The live version maps to the reviewed commit; the health endpoint reports D1 and R2 healthy; one synthetic end-to-end record reconciles without manual database edits. |
| 7 | `c11-dns`, `email.delivery` | Configuration + evidence | Add one SPF record, generate and publish the Google Workspace DKIM record, and add DMARC in monitoring mode. Verify them from multiple resolvers, then prove delivery and replies with an external mailbox and capture full authentication headers. Add bounce/complaint handling or a documented queue check. | `npm run dns:verify` passes SPF, DKIM, and DMARC; external evidence shows SPF/DKIM/DMARC results and the operating-control link is attached. |
| 8 | `c10-reorder` | Build | Add “Order again” as a server-side copy into a new cart. Re-resolve current product visibility, pack sizes, prices, availability, and eligibility; never copy the old price, old lot allocation, payment state, or shipping state. Report lines that are no longer purchasable. | An account-scoped integration test proves ownership, current-price recalculation, unavailable-line handling, idempotency, and that the original order is unchanged. |
| 9 | `c10-docs` | Build | Turn the current per-order document links into a customer document locker grouped by order and lot. Show the pinned COA/SDS as shipped, its hash/date, and a notice when a later revision exists without replacing the pinned copy. | Supersession tests prove old orders still serve old bytes, new orders serve the new revision, cross-account access fails, and the customer can browse all of their issued material documents in one place. |
| 10 | `c10-notes`, `c10-perms` | Build + decision dependency | Add append-only, attributed, dated internal customer notes with edit-by-supersession rather than silent overwrite. After the members resolve the authority question, split customer-data visibility from customer approval so each staff role sees only the fields and actions it needs. | Note history names the staff actor and time; permission tests cover index, detail, documents, contact data, notes, exports, and approval actions for every role. |
| 11 | `c10-immutable` | Infrastructure + policy dependency | After the retention period is approved, add R2 bucket-lock rules for the immutable prefixes, beginning with `issued/`. Use a finite retention period unless the members deliberately approve an indefinite lock. Test on staging before production. | Cloudflare lists the approved lock rule, overwrite/delete attempts during retention fail, new versions use new object keys, and retrieval still works. |
| 12 | `c16-backup`, `c16-rto`, `continuity.backup` | Credential + rehearsal | Create separate R2 S3 recovery credentials and use the Cloudflare token from item 3. Run `npm run ops:rehearsal:staging` into an encrypted private evidence folder, restore D1 into isolation, copy and restore R2 into an isolated bucket, compare manifests/checksums, and record elapsed time. | The generated report says passed for D1 and R2, records volume and recovery time, and is witnessed and linked to the continuity control. |
| 13 | `c16-controls`, `c16-evidence` | Register evidence | Correct the stale chapter status: the 30 controls are already assigned with due dates. Work the evidence queue from launch-critical dependencies outward; link deployment, DNS, mail, payment, shipping, recovery, and rehearsal evidence rather than pasting claims into notes. | Every control is `ready`, `not_applicable` with an approved reason, or explicitly blocked with a named dependency; no launch control relies on an empty evidence field. |
| 14 | `c1-gsc`, `c1-metrics` | External verification + build | Verify the production domain property in Search Console before cutover. Save the indexed-URL export. Add a small reporting job or documented export that separates identity/accession queries from brand queries and stores the dated result. | Property ownership is verified, the pre-cutover URL list is stored, and the first query-category report is linked in the discovery register. |
| 15 | `c16-plan`, `c16-secondpair`, `c16-fallback` | Operational resilience | Confirm the Workers plan and CPU limits, review persisted staging logs for 1102 errors, and run the two-vantage performance check. Give a named fallback operator their own Cloudflare and GitHub access, then have that person perform the staging rollback walkthrough while Ammre observes. | Plan/log findings are recorded, two-vantage results are saved, the fallback can deploy and roll back without shared credentials, and the rehearsal case is signed. |
| 16 | `c11-export`, `c11-exportrec`, `c11-triggers`, `c11-keephost` | Cutover preparation | Export and verify WordPress customers, orders, SureCart payments, products, content, media, and a full backup into company-controlled storage. Fill the export record. Set rollback thresholds, name the fallback, lower apex TTL to 300 at least 24 hours before cutover, and keep WordPress unchanged. | The archive opens and reconciles to WordPress counts, the record is complete, rollback thresholds are signed, and the old host remains available. |
| 17 | `c11-rails`, `c11-domain`, `c11-mailwatch`, `c11-coldmeasure` | Production release + cutover | Configure only the approved production payment rail, tax, email, shipping, and staff-access settings. Release a reviewed `v*` tag, apply the pending production migrations through the workflow, smoke-test the Worker URL, then attach the custom domain. Run cutover verification from two networks, test old URLs, and send/reply from each mailbox during the first hour. | The production health endpoint is healthy, selected rails show live, private routes are protected, old URLs follow the map, mail works both ways, no 1102 pattern appears, and the custom domain serves the tagged version. |
| 18 | `c1-metrics`, `c11-cold`, post-cutover controls | Monitoring | For the first month, review Search Console query groups, Worker CPU/errors, email authentication reports, payment reconciliation, shipping exceptions, and backups. Keep WordPress until Melissa and Wisam approve retention/decommissioning. | Weekly evidence exists for the first month, exceptions are cases with owners, and decommissioning occurs only after the recorded member decision. |

## Register corrections to make now

- Mark `c10-history` complete: the customer order detail already shows owned
  orders, lines, and lot numbers.
- Mark `c10-staffpage` complete: `/manage/accounts` and
  `/manage/accounts/<id>` already provide search, account state, organization,
  orders, acknowledgements, sessions, email links, and service history.
- Keep `c10-docs` open: pinned links exist per order, but the consolidated locker
  and newer-revision notice are not built.
- Mark the assignment portion of `c16-controls` complete: all 30 controls have an
  owner and due date. Evidence and approvals remain completely open.
- Rewrite or waive `c16-protect` / `access.staging`: the owner deliberately chose
  public staging on 14 September 2026 and the Basic-auth secret was removed. The
  accurate remaining control is public/private boundary enforcement plus
  `noindex`, not a password that no longer exists.

## Definition of Ammre complete

Ammre's technical register is complete when the reviewed source is on
`origin/main`, CI can deploy without a laptop, staging runs that source, the
remaining customer features are tested, mail and payment configuration are
proven, immutable records and recovery are exercised, a second operator can
recover the system, and every technical control has linked evidence. Production
cutover is then an authorized member decision executed through the tested release
path, rather than additional untracked engineering work.
