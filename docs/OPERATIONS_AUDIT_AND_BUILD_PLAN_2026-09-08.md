# Operations audit and build plan — 8 September 2026

Status: authoritative working audit for the current application. This is not a business-launch, legal, tax, quality, insurance, or production-cutover approval.

## Executive finding

NexPhase now has a strong transactional core and the directly buildable operating-control layer around it. The application can record products, suppliers, purchase orders, lot receipt and testing, named lot disposition, inventory movements, orders, ownership and handoffs, payment attempts, reservations, shipping, evidenced delivery, returns, refunds, documents, notices, operational cases, readiness controls, and period reports. The remaining launch gap is operational proof: approved authority and policies, real business data and provider configuration, protected-environment evidence, rehearsals, training, and member acceptance.

The starting code baseline was healthy: `main` and `origin/main` pointed to `7b7c899`; the worktree was clean at the start of this audit; type-check, lint, 63 test files / 574 tests, and a production build passed. Staging health returned database and document storage `ok`. The repair set adds migrations 0041 through 0048 and new workflow tests. Final verification results are recorded in the implementation outcome below. These checks prove software integrity, not operational readiness.

Production must remain closed to real acceptance until the launch-blocking controls below have evidence. The public domain still serves the prior WordPress site. A staging Shippo test-mode rehearsal has now proven a USPS rate, one test label, tracking, carrier handoff, evidenced delivery, packing slip, invoice, quarantined return, recorded synthetic refund, and operational reports. Staging uses one named ship-from location while tax and payment remain simulated. No live carrier purchase, tax determination, settlement, refund, email delivery, backup restoration, or full named-team rehearsal has been proven.

## Definitions used in this audit

| State | Meaning |
| --- | --- |
| Built | A staff/customer workflow and its data rules exist in code. |
| Verified | Automated tests or a controlled rehearsal prove the workflow behaves as designed. |
| Operationally ready | A named owner, approved rule, real configuration/data, evidence, exception path, and monitoring are present. |
| Launch approved | The members and relevant advisers have accepted the residual business risk. Software cannot grant this state. |

“Fully usable” in this plan means a trained person can complete the normal path and the documented exception path, with permissions, evidence, and an attributable history. It does not mean that missing legal advice, carrier accounts, tax decisions, insurance, physical inventory, or executive approval can be replaced by code.

## Current-state process map

| Workflow | Current system of record | Current state | Primary gap |
| --- | --- | --- | --- |
| Governance and launch controls | Application Operating Controls plus controlled evidence links | Built/tested; evidence unpopulated | The register, due dates, history, review gate, and dashboard exist. Business owners must seed controls, attach real evidence, and approve them. |
| Staff access | App staff users; three permission-backed role templates | Built and tested for the approved three-seat model | The exact matrix is enforced and displayed. The three names, backups, access review, MFA/identity-provider decision, and member approval remain. |
| Catalog and product documentation | App products, revisions, images, SDS | Built | Real approved prices, source files, SDSs, publication approvals, and owner sign-off are not populated/proven. |
| Supplier qualification | App suppliers and qualification events | Core completed/tested | Qualification now requires a reason, approved scope, evidence link, and future review date. Detailed evidence files and the authority mapping still require business approval. |
| Purchasing | App purchase orders and receipt matching | Core built/tested | No issued PO document or approval threshold, vendor transmission evidence, invoice/AP matching, or overdue follow-up workflow. |
| Receiving and quarantine | App lot intake and receipt movement | Built/tested | Physical inventory has not been loaded. Receiving labels, count verification, damage/deviation workflow, and Drive evidence linkage are not proven. |
| Testing and release | App tests, documents, release blockers, disposition history | Strong core built/tested | No explicit exceptional-release/countersignature workflow, technical reviewer rule, training record, or approved specification register. |
| Inventory control | Lot quantity and append-only movements | Core completed in this repair set | Receipt, shipment, adjustment, sample, and dual-witness destruction are now executable and tested. Cycle-count planning/reconciliation remains. |
| Recall/withdrawal/CAPA | Lot hold/withdraw, consignee report, operational cases and events | Core completed/tested | Cases now enforce containment, investigation, action, effectiveness, and administrator closure. A real mock recall and consignee communication rehearsal remain unproven. |
| Customer/account review | Optional accounts and organization verification; staging guest checkout | Built, policy unresolved | Owner-directed guest checkout supersedes institutional gating in staging. Production eligibility, verification policy, and authority must be explicitly approved. |
| Order-to-cash | Cart, accepted quotes, immutable totals, payment attempt/recovery, invoices | Strong core built/tested | No real payment/tax configuration or settlement reconciliation; manual bank evidence and daily cash control remain undefined. |
| Fulfillment and shipping | Reservations, pick/pack, labels, tracking, packing slip, delivery evidence | Strong core plus USPS staging proof | Named ship-from selection, service allowlist, one active label, refund/void reconciliation, replacement-after-void, label history, carrier handoff, and evidenced delivery are built. Shippo authenticated the selected USPS test account and produced a PDF test label. Parcel and service approval, live carrier scans, and dangerous-goods handling remain unproven. |
| Customer service | Feedback queue, operational cases, order ownership/events, return/refund | Core completed/tested | Orders can be claimed, assigned, handed off, dated, and filtered for overdue/unassigned work. Service-level, remedy, and communication policies still need approval. |
| Notifications | Durable order-notice queue and handling history | Partial; staging sender and delivery proven | Order notices are durable and staging has least-scope Gmail OAuth plus a one-address allowlist. The verified `research@` identity sent one final test that was accepted once and arrived once as NexPhase Labs. Auth, verification, and digest messages are not all durable; bounce/delivery events and a named owner remain. |
| Finance and close | Period-bounded orders and movement reports plus current inventory snapshot | Partial by design | Date selection and clearly scoped CSVs are built/tested. Accounting integration, bank/provider reconciliation, AP/AR, tax liability workflow, and approved month-end close remain external work. |
| Security and continuity | CI, deploy workflows, complete health checks, backup/restore scripts and runbook | Technical foundation built/tested | D1 export, checksum, isolated restore verification, integrity/FK/table checks, and incident cases exist. A real staging backup, R2 restore, recovery-time test, protected staging proof, and on-call approval remain. |
| Document control and training | Audit, runbook, business manual, technical manual, and SOP 003–012 library | Controlled drafts created and visually verified | Documents must be approved, issued to the controlled repository, walked through by named operators, corrected, and acknowledged before use. |

## Waste and failure modes in the current workflow

| Type | Current cause | Operational effect | Target state |
| --- | --- | --- | --- |
| Waiting | Decisions and evidence live in separate docs/inboxes without a single owner/date. | Launch blockers age invisibly. | One readiness/control register and overdue queue. |
| Rework | The setup workbook and readiness documents disagree with the live application. | Team repeats audits and may act on stale tasks. | Application is the status record; Drive holds controlled evidence/SOPs; one tracker references both. |
| Handoffs | Orders and controls are queues, not assigned work. | Two people may assume the other owns the next action. | Claim/assign, due time, handoff event, and escalation. |
| Manual work | Sample, destruction, and stock adjustments require records outside the application. | Inventory ledger cannot be complete. | Validated, attributed movement workflows with dual witness for destruction. |
| Overprocessing | Earlier role descriptions and server guards could drift apart. | A person could misunderstand what a role actually authorizes. | One permission source now drives every guard and the displayed three-person matrix; admin emergency use requires review. |
| Hidden exceptions | Release, recall, notification, payment, and label exceptions have different ad hoc handling. | Exceptions are hard to age, escalate, and close consistently. | Common case/exception control with owner, evidence, action history, and closure rule. |

## Implementation outcome for this repair set

| Work item | Outcome | Evidence still required for operational readiness |
| --- | --- | --- |
| Operating controls | Built owner, due date, evidence, status, launch-critical gate, administrator review, optimistic concurrency, and append-only event history. | Seed the real control library, assign owners, attach evidence, and record approvals. |
| Inventory movements | Built receipt/shipment direction plus sample, destruction, and adjustment workflows with unit/date/reason checks, reservation protection, atomic balances, and two witnesses for destruction. | Load and count physical inventory; investigate and approve real variances. |
| Operational cases | Built complaint, deviation, supplier issue, incident, CAPA, and recall cases with severity, containment, linked records, root cause, actions, evidence, effectiveness, and controlled closure. | Perform mock recall and incident exercises with real operators. |
| Order handoffs | Built claim/assign/reassign, future service deadline, handoff note/history, and assigned/overdue/unassigned queues. | Approve service levels and map named users to authority. |
| Three-person authority | Built one permission source and exact displayed templates for Business & Systems, Quality & Supply, and Customer & Fulfillment. Existing server guards resolve through the matrix. | Insert the three names and backups, approve the matrix, rehearse each account, and record periodic access review. |
| Google Workspace email | Built Gmail API delivery with internal mailbox OAuth or delegated service-account authorization, deterministic Message-ID, non-production allowlist, and conservative ambiguous-send handling. Internal OAuth uses only `gmail.send`; protected staging secrets and the verified `research@` Send-as identity are active. Final evidence shows one accepted attempt and one inbox copy displayed as NexPhase Labs. | Add bounce/complaint monitoring, exercise each notification class, capture full authentication headers from an external test inbox, and eventually authorize production separately. |
| Automatic carrier tracking | Built and deployed token-gated Shippo `track_updated` ingestion, independent Shippo lookup, label/transaction/environment matching, deduplication, delivered-order update, and exception queue. The distinct staging token and active Shippo test webhook are configured. | Trigger and capture a genuine staged tracking update, then separately approve any live key/webhook and live carrier evidence. |
| Reports | Built UTC From/Through periods for orders and movements; inventory is explicitly a current snapshot; filenames retain the period. | Reconcile staged exports to bank, provider, supplier, accounting, and tax evidence. |
| Supplier qualification | Built required approved scope, evidence URL, reason, and next review date. | Supply real qualification files and approve decision authority. |
| USPS | Added USPS to the existing Shippo quote, checkout, label, allowlist, readiness, and reporting paths; authenticated the active test account; verified rates and downloadable PDF test labels. Added named origins, stored origin history, Ground Advantage/Priority service control, one-request refund protection, read-only reconciliation, order-cancellation blocking, replacement only after confirmed void, and evidence-based delivery confirmation. | Approve the provisional parcel and service policy; prove live carrier events and dangerous-goods behavior. |
| Health and recovery | Expanded health across both schema groups; added explicit-environment D1 export, checksum manifest, isolated restore verification, and recovery runbook. | Run the staging D1 and R2 rehearsal, record elapsed time, protect staging, and approve recovery objectives. |
| Manuals | Created MAN 001, MAN 002, and SOP 003–012 as controlled drafts; rendered and visually inspected every page. | Approve authority/policies, execute operator walkthroughs, record training, and issue revisions. |

Final technical verification passed after the completed repair set: type-check and lint were clean, all 70 test files and 628 tests passed, and the production build completed. Shipping migration 0047 passed both a blank-database replay and an upgrade rehearsal containing a pre-existing label. Delivery migration 0048 adds delivery time and evidence without changing prior shipment records. Migrations 0041 through 0049 were applied to staging. Staging Worker version `4cec8b4e-addf-49b1-992a-dfa4a1536b64` deployed successfully, and staging health confirmed both database and document storage `ok`.

### Staging client walkthrough evidence

Order `NX-260908-0001` was completed with synthetic customer data through checkout, a simulated payment, lot allocation, pick and pack, USPS Ground Advantage quote at $5.58, one Shippo test label, carrier handoff, evidenced delivery, packing slip `PS-NX-260908-0001`, invoice `INV-2026-0001`, quarantined return, $25.00 synthetic refund, and customer-visible status. Lot `STG-001` moved from 10 g to 9.999 g and the movement and revenue reports reconciled the shipment and return. The return did not restore sellable stock.

The walkthrough exposed and repaired three material defects: the customer order page exceeded the hosted database resource envelope, the reporting query selected more columns than Cloudflare D1 permits, and delivery had no controlled evidence step. The repaired customer page passed five consecutive full reloads. Reports now select only required fields, and delivery requires a shipped order, carrier, tracking, a valid nonfuture date, and evidence. Cloudflare currently limits a D1 query result to 100 columns; the narrow report projection is designed around that published limit: https://developers.cloudflare.com/d1/platform/limits/.

Twelve historical synthetic notices remain in `Needs attention` for example-address recipients that are not on the staging allowlist. Google Workspace Gmail API support, internal OAuth, protected staging secrets, a one-address allowlist, and the verified `research@` Send-as identity are configured. The final expressly approved test notice to `sam@nexphaselabs.net` was accepted on its first attempt, arrived exactly once, and displayed NexPhase Labs as the sender. No other notice is pending or can be released automatically.

## Findings ranked by action

### P0 — fix before a real order can be accepted

1. Populate and approve the now-built operating-control register with real owners, due dates, evidence, and review decisions.
2. Reconcile the now-complete inventory movement workflow to a witnessed physical count.
3. Approve and assign the now-enforced three-person authority matrix; name backups and define the exact exceptional-release countersignature rule.
4. Rehearse the now-built quality-exception/recall/CAPA workflow against a held or withdrawn lot and prove affected-consignee communications.
5. Prove real environment controls: protected staging, execute the now-built backup/export/restore workflow, approve production configuration, and rehearse rollback.
6. Complete live-provider readiness for payment, tax, email, shipping, and refunds. Simulated success is not accepted evidence.

### P1 — required for a repeatable first month

1. Populate and review the now-built supplier qualification scope, evidence links, and review dates.
2. Add issued purchase-order documents, transmission acknowledgment, approval thresholds, and three-way AP matching fields.
3. Approve service levels and validate the now-built order ownership/claim/handoff and overdue queues with named operators.
4. Add cycle counts and inventory reconciliation with investigated variances and approval.
5. Use the now-built period-bounded reports as inputs to settlement reconciliation, AP/AR, and an approved month-end close checklist.
6. Make all customer-impacting notifications durable and record delivery/bounce evidence.
7. Activate the now-built USPS path after service, package, dangerous-goods, and return-label policies are approved; keep UPS and FedEx comparison.

### P2 — scale after the first controlled operating cycle

1. Customer follow-up tasks and a light sales pipeline when real lead volume justifies it.
2. Barcode/location scanning, replenishment rules, and carrier performance reporting.
3. Accounting-platform sync after the CPA approves mappings; do not build a homemade general ledger.
4. Vendor scorecards, periodic quality review, and trend metrics after enough real data exists.

## Build sequence and acceptance tests

### Phase 1 — control plane and truthful readiness

Implementation status: technical workflow complete and tested; real control seeding, ownership, evidence, and approval remain.

Build the operating-control register, seed the complete control library, expose it to staff, require evidence for `ready`, require a reason for `blocked`/`not applicable`, record every change, show overdue and launch-blocking counts on the dashboard, and include every new table in health checks.

Acceptance: concurrent/stale updates fail safely; a control cannot be marked ready without an owner and evidence; the page distinguishes software checks from business evidence; role restrictions and event history are tested; a fresh database migrates cleanly.

### Phase 2 — inventory integrity

Implementation status: technical workflow complete and tested; physical count and real reconciliation remain.

Add sample, negative/positive adjustment, and destruction workflows. A positive adjustment requires a reconciled reason; destruction requires two distinct named witnesses; no movement can drive stock below zero; a non-released lot cannot be made sellable by a movement; every movement and quantity update is atomic.

Acceptance: transaction, race, invalid-unit, overdraw, witness, audit-history, and report tests pass; the UI exposes only allowed actions for the current role/status.

### Phase 3 — authority and handoffs

Implementation status: order ownership, deadlines, queues, handoff history, and a single permission-backed three-role matrix are complete and tested. Names, backups, member approval, and exceptional-release rules remain.

Use the three approved least-privilege role templates as the authorization source and show the exact matrix in staff administration. Add order owner, claim/reassign/handoff events, target dates, and overdue dashboard queues. Encode exceptional-release countersignature only after the members approve its exact trigger.

Acceptance: a matrix test proves each capability can do only its assigned actions; existing sessions cannot retain removed authority; every handoff has one current owner and a historical event.

### Phase 4 — quality exceptions, recalls, and complaints

Implementation status: common case workflow and closure guards are complete and tested. Real recall, complaint, and incident rehearsals remain.

Add one controlled case model for deviation, complaint, supplier issue, security/operations incident, CAPA, and recall. Cases carry severity, owner, due date, linked lots/orders/suppliers, containment, root cause, corrective/preventive actions, evidence, approvals, effectiveness check, and closure.

Acceptance: a released-lot recall begins with an atomic hold/withdraw action or refuses; affected consignee export is complete; closure is impossible with open required actions; communications remain attributable.

### Phase 5 — procurement and finance completion

Implementation status: supplier qualification evidence fields and period-bounded reports are complete and tested. Issued PO documents, AP matching, settlement reconciliation, AP/AR, and approved close remain.

Add structured supplier evidence/review dates, issued PO PDFs, approval/transmission/acknowledgment, supplier invoice and receiving match, payment due tracking, report date filters, settlement reconciliation, and month-end checklist.

Acceptance: one synthetic PO reconciles ordered, received, invoiced, and paid totals; exceptions remain open and visible; CSV totals reconcile exactly to the staged order/refund/lot-cost fixture.

### Phase 6 — carrier, tax, payment, and messaging activation

Implementation status: USPS code path is complete through Shippo. On 9 September 2026, staging order `NX-260908-0001` used a $5.58 Ground Advantage quote and one Shippo test label with tracking `9300120845500000525553`. Staff recorded the synthetic handoff and delivery evidence, then completed a quarantined return and $25.00 synthetic refund. No live charge, live label, live refund, or customer message was performed.

Approve the provisional Ground Advantage and Priority service policy and parcel profile; approve each additional origin before enabling it; connect the selected payment, tax, and email services; add durable non-order messaging and provider delivery-event ingestion.

Acceptance: sandbox quotes from USPS/UPS/FedEx, one label purchase/void, one tax calculation, one settlement/refund reconciliation, and allowed inbox delivery/bounce are captured as evidence. No production charge or customer contact is part of sandbox acceptance.

### Phase 7 — resilience and complete rehearsal

Implementation status: complete health probes, D1 export/verification tools, operational incident cases, and the runbook are built. One synthetic client order has been rehearsed through delivery, return, refund, documents, customer status, and reports, and the resulting defects were repaired. Protected-staging proof, D1/R2 recovery rehearsal, recovery objectives, supplier-to-close rehearsal, external-boundary failures, and a named-team walkthrough remain.

Protect staging, execute database and object-store backup/export/restore, record recovery time/results, then run the named team through supplier → PO → receipt → test → release → catalog → checkout → payment → pick/pack → USPS/UPS/FedEx shipment → evidenced delivery → return/refund → reports → close, including one failure at each external boundary.

Acceptance: every launch-critical control has current evidence; no unresolved P0 defect; all automated checks pass; rehearsal variances are closed or explicitly accepted by the authorized members.

### Phase 8 — controlled SOP/manual library

Implementation status: MAN 001, MAN 002, and SOP 003–012 are complete as controlled drafts, accessibility-checked, rendered, and visually verified. They are not issued until approval and operator walkthrough evidence are recorded.

Write manuals only from the verified interface and approved policies. Issue a master operating manual plus controlled SOPs for daily queue, weekly review, access, catalog change, supplier qualification, purchasing/receiving, lot testing/release, inventory movements/counts, recall/CAPA, order/payment, fulfillment/carriers, customer service/returns/refunds, notifications, finance close, document control/training, deployment/change, backup/restore, and incident response.

Acceptance: each SOP contains owner, revision, approver/effective date, purpose/scope, RACI, prerequisites, exact steps with expected output, exceptions/escalation, completion criteria, metrics, records, and review date. Each named operator performs their assigned workflow from the manual and records corrections before issue.

## Inputs the business must supply

- Named authority/capability assignments and the exact exceptional-release trigger/countersign rule.
- Approved product prices, physical stock, manufacturer/supplier evidence, testing specifications, SDS/COA files, and release decisions.
- Ship-from/return address, packaging profiles, service/handling/temperature/dangerous-goods rules, and carrier accounts.
- Tax treatment/nexus and chosen tax service; payment/refund rail and settlement policy; approved email sender and test recipients.
- Supplier approval criteria, PO approval thresholds, payment terms, accounting platform/mappings, close calendar, and CPA review.
- Legal/counsel review, insurance, zoning/facility evidence, records-retention policy, and the members' launch decision.

## Source-of-truth rule

- The web application is authoritative for suppliers, lots, inventory, orders, payments, shipments, delivery evidence, returns, operational cases, and readiness controls.
- Shared Drive is authoritative for governing documents, signed agreements, source evidence, issued SOPs, training records, and restricted finance/legal files.
- The operations tracker holds setup/project actions and canonical links only; it must not duplicate live inventory, release status, order status, or payment status.
- Secrets remain in the approved credential/deployment systems and never in Drive, notes, SOPs, or the application control register.

## Current implementation boundary

The directly implementable repair set is complete and deployed to staging only. Next work requires owner-supplied authority, policy, accounts, data, or rehearsal participation. The application must not mark a business control ready, invent business data or policy, activate production, charge money, buy live labels, contact real customers, or grant a person authority that the members have not approved. Production was not deployed or changed as part of this repair set.

## Next-stage implementation update — 9 September 2026

- Added a Google Workspace Gmail API email provider with internal OAuth and delegated-service-account modes, nonproduction recipient controls, stable message IDs, bounded retry behavior, and retained Resend support. Internal OAuth is authorized with only `gmail.send`; credentials and `sam@nexphaselabs.net` as the sole test recipient are stored as staging secrets. `research@` is verified as a Send-as identity, and the final controlled message was accepted once and arrived once displaying NexPhase Labs. Broader workflow, external-header, and delivery-event evidence remain.
- Added independently verified Shippo `track_updated` processing, durable event deduplication, automatic delivery recording, and a staff exception queue. A distinct staging secret is installed and the matching Shippo test webhook is active; the genuine tracking-event rehearsal remains.
- Replaced role-name assumptions with one permission-backed three-person authority model: Business & Systems Lead, Quality & Supply Lead, and Customer & Fulfillment Lead. Named assignments and member approval remain.
- Applied migration `0049_flat_wiccan.sql` to staging and deployed version `4cec8b4e-addf-49b1-992a-dfa4a1536b64`. Root and health probes passed. The complete check suite passed: 70 test files and 628 tests.
- Attempted a real staging D1 export. The account could query the database, but Cloudflare rejected the export operation with authorization code 10000. Database restore and R2 recovery therefore remain unproven launch blockers; this is not recorded as a passed rehearsal.
- Google Workspace authorization and Shippo login/configuration are complete for staging. A deployment command briefly targeted production because the generated deployment configuration ignored the staging flag; the prior production version `926f9325-8081-4e89-9fd6-b8b6c965cab7` was immediately restored and verified at 100% traffic. Production roots return HTTP 200, and no production data, secrets, DNS, payment, or shipping configuration changed.
