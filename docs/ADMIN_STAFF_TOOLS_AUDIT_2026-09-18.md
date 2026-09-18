# Admin and staff tools audit — 18 September 2026

**Scope.** This is a code-and-evidence audit of the internal NexPhase
application as it exists on 18 September 2026. “Complete” below means that a
normal application path and its principal exception path are implemented and
guarded; it does **not** mean that production data, provider configuration,
training, approval, or launch evidence exists. No production changes or
destructive exercises were performed.

## Executive summary

The application has a substantial, coherent staff operating surface. Staff
sign-in, one-time-password containment, role-backed navigation, catalog and
quality records, procurement, order ownership, fulfillment, returns, payment
attempt recovery, Zelle review, notifications, controls, cases, reports, and
staff-account administration are implemented. The strongest areas are
append-only staff changes, atomic inventory/reservation rules, explicit order
next steps, durable order notices, and document authorization. The application
is **not** operationally ready to accept real business activity: authority and
backup assignments, approved data and policies, provider activation,
continuity evidence, and named-team rehearsals remain external dependencies
(`docs/OPERATIONS_AUDIT_AND_BUILD_PLAN_2026-09-08.md:13-22,178-196`).

The highest software-control risks are:

1. Financial/refund and shipping-refund authorization does not consistently
   use the declared `finance.manage` permission or dual approval; some
   destructive shipping actions are available through `canFulfil`
   (`lib/staff-roles.ts:5-30,38-51`,
   `app/api/manage/orders/[orderNumber]/shipping/refund/route.ts:13-21`).
2. Sensitive CSV exports have no export event, purpose, step-up confirmation,
   or download audit, although they contain customer and financial data
   (`app/api/manage/reports/orders.csv/route.ts:7-25`).
3. The readiness ledger records evidence but does not itself block all
   launch-critical selling or shipping paths; this is intentional in code but
   needs an explicit business gate (`lib/operational-controls.ts:38-52`).
4. Queue usability does not scale: orders, lots, and verification have no
   bulk work; lots and verification lack search/pagination; mobile tables
   require horizontal scrolling (`app/manage/orders/page.tsx:98-188`,
   `app/manage/lots/page.tsx:70-164`,
   `app/manage/verification/page.tsx:35-133`).

The strongest security controls are PBKDF2 password hashing, hashed bearer
tokens, expiry/revocation, lockout, same-origin POST checks, one-time-password
session isolation, last-admin protection, and session revocation after
deactivation/password change (`lib/staff-auth.ts:8-18,63-105,147-194,215-236`,
`lib/staff-admin.ts:80-191,227-245`). Remaining findings are prioritized in
§4. Existing Tasks 2, 12, 13, 16, 25, 26, 30, 34, 35, 38, 39, 43, 44, and 48
are explicitly reconciled in §8 and are not duplicated.

## 1. Permission model and enforcement vocabulary

The canonical roles are `admin`, `qc`, and `ops`. The declared permissions are
staff access, account approval, finance, sensitive reports, catalog, quality,
fulfillment, procurement, feedback, and operations
(`lib/staff-roles.ts:1-30`). The templates currently grant:

| Role | Declared permissions |
| --- | --- |
| `admin` | All ten permissions |
| `qc` | `catalog.manage`, `quality.manage`, `operations.manage` |
| `ops` | `fulfillment.manage`, `procurement.manage`, `feedback.manage`, `operations.manage` |

The following matrix distinguishes **navigation**, **page**, **server
action**, and **API** controls. “Session” means `requireStaff`/`getStaff`;
one-time-password sessions are excluded from all ordinary internal data and
mutations (`lib/staff-auth.ts:197-236`).

| Capability/domain | Navigation | Page/read gate | Server action gate | API/write gate |
| --- | --- | --- | --- | --- |
| Dashboard, orders, activity | all staff | session | n/a/read | session plus route-specific permission for writes |
| Catalog/classes/waitlist | catalog roles for waitlist; catalog/classes links currently broad | catalog pages use `requireStaff`, edit pages/actions use `canEditCatalog` | `catalog.manage` | product image/SDS and class APIs check catalog permission |
| Lots/quality | Lots link is broad | session for read; operation-specific page actions | quality for results/disposition; fulfillment for some stock actions | document, COA, cost, label routes check the relevant capability |
| Verification/accounts | `canVerifyAccounts` | account pages use account approval gate | `accounts.approve` | organization document routes check account permission |
| Orders/payment/refund | Orders link is broad | session; detail actions split by operation | fulfillment or account/finance-adjacent checks | paid/cancel/refund/reconcile use account capability; shipping uses fulfillment |
| Zelle | `canVerifyAccounts` | page rejects non-account approvers | n/a | sync/reconcile/receipt routes require staff and same-origin; decision rules are in `lib/staff-rules.ts` |
| Procurement | `canFulfil` navigation (despite `procurement.manage` naming) | procurement pages use procurement capability | procurement capability | supplier/PO endpoints use the same domain guard |
| Feedback | feedback-capable roles only | feedback page/detail use feedback capability | feedback capability | reply/focus endpoints check feedback capability |
| Controls/cases | broad links | session; mutations check operations capability | operations capability | APIs/action handlers check staff and domain rule |
| Reports/notifications/readiness | admin-only navigation for reports, notifications, readiness | reports/readiness should be independently checked | digest/notification actions are admin-gated | CSV routes use `canVerifyAccounts`; notifications and digest use admin gate |
| Staff accounts | admin-only navigation | `canManageStaff` and `requireStaff` | admin-only | staff APIs/actions use admin gate |
| Affiliates/coupons/hazcom | admin-only navigation | admin gate | admin gate | explicit admin checks, e.g. affiliates and coupons |

This is not a claim that every row is wrong. It identifies an important
taxonomy drift: `finance.manage` and `reports.sensitive` are declared but are
not the consistently enforced guards; `canVerifyAccounts` is reused for
payment/refund/report operations (`lib/staff-auth.ts:239-281`,
`app/manage/layout.tsx:54-80`). Navigation is never an authorization
boundary: the layout itself says child pages must re-check
(`app/manage/layout.tsx:15-19`).

## 2. Exhaustive internal capability inventory

The route families below include the page, queue, form, mutation, download,
notification, and handoff surfaces found in the repository. A route family
entry includes its nested pages and APIs unless separately noted.

| Surface and operator goal | Data/evidence and mutation | Role and handoff | Classification |
| --- | --- | --- | --- |
| `/staff/sign-in`, `/staff/password`; sign in, replace one-time password, change password | Session rows, staff events, password-change event; POST auth routes | All staff identities; sign-in → password → internal queue | **Complete** for software; MFA/identity-provider decision is manual (`app/staff/sign-in/page.tsx:23-88`, `app/staff/password/page.tsx:20-66`) |
| `/manage` dashboard; triage today’s work | Queue counts, lot alerts, activity, controls, cases, notices; links and admin digest form | Session; role-aware tiles and queue handoff | **Complete/partial**: useful queue summary, but evidence and owner assignment remain operational (`app/manage/page.tsx:31-147,194-266`) |
| `/manage/products`, `/new`, `/[code]`; maintain catalog, prices, images, SDS | Product revisions, images, SDS, publication history; create/edit/upload actions | `catalog.manage`; QC supplies scientific evidence, admin approves commercial fields | **Complete/operationally blocked** by real approved prices, files, manufacturer data, and stock (`app/manage/products`, `lib/catalog-readiness.ts`) |
| `/manage/classes`, `/[id]`; maintain class/domain information | Class records and revisions; class actions | `catalog.manage`; quality/commercial review handoff | **Complete** normal path; approval policy is manual (`app/manage/classes/page.tsx:20-28`) |
| `/manage/lots`, `/new`, `/[lotNumber]`; receive, quarantine, test, release, hold, withdraw, correct | Lot status, quantity movements, test results, COA/SDS/documents, label; actions and APIs for cost, documents, COA, label | QC owns quality; ops custody/fulfillment movement; evidence in lot/activity history | **Complete/partial**: exception-release countersignature, physical count, and real evidence are absent (`app/manage/lots/actions.ts:79-269`, `app/api/manage/lots/[lotNumber]`) |
| `/manage/procurement`, suppliers, purchase orders | Suppliers, qualification evidence/review dates, POs, receipts, events | `procurement.manage` (ops/admin); supplier → PO → receiving → AP | **Complete/operationally blocked**: no issued PO/transmission/AP three-way match (`app/manage/procurement`, `lib/procurement.ts:64-130`) |
| `/manage/verification`, `/manage/accounts`, nested IDs; review customer organizations | Verification state, submitted documents, approval events, document downloads | `accounts.approve` (currently admin/qc); facts → decision | **Complete/partial**: production eligibility and approved guest/institution policy remain manual (`app/manage/verification`, `app/manage/accounts`) |
| `/manage/orders`, nested order; triage, claim, handoff, fulfill, ship, deliver, return, refund, cancel | Order/payment/reservation/shipment/return/refund state, owner and next step; actions and APIs for paid, fulfill, ship, delivery, return, refund, reconcile, invoice, packing slip, labels | Orders visible to all staff; payment/account and fulfillment split; ops → admin finance handoff | **Complete/partial**: synthetic lifecycle proven; live provider and historical refund exceptions remain manual (`app/manage/orders/page.tsx:49-188`, `app/api/manage/orders/[orderNumber]`) |
| `/manage/payments/zelle`; sync mailbox, review exact matches, reject, daily reconcile | Immutable receipt parser/authentication/completion evidence, reconciliation runs, outcome events | Account/finance decision role; receipt → order/payment → reconciliation | **Partial/intentionally manual**: matching and Chase confirmation require a person; stale status cleanup is open (Task 34) (`app/manage/payments/zelle/page.tsx:41-59,137-266`) |
| `/manage/waitlist`; inspect waiting/notified recipients | Durable waitlist state and notification claim/outbox | Catalog role; waitlist → first-come notice, no reservation | **Complete/intentional limit**: no future-stock reservation/charge (Tasks 25/26) (`lib/waitlist.ts:100-176`) |
| `/manage/feedback`, nested public IDs; answer customer feedback | Threads, screenshots, replies, focus/archive/status events | `feedback.manage`; visitor → assigned staff → waiting customer/closed | **Complete/partial**: provider delivery and service-level policy manual (`app/manage/feedback`, `lib/feedback.ts:155-550`) |
| `/manage/notifications`; inspect/retry customer notifications | Durable order outbox, attempts, handling notes, retry API | Admin navigation/API; failed send → retry/attention | **Partial/operationally blocked**: non-order durability and bounce/complaint events remain (`app/manage/notifications`, `lib/notification-delivery.ts`) |
| `/manage/controls`, `/manage/readiness`; record controls and decide launch evidence | Control owners, due dates, evidence URL, status/event history; assignment/update actions | `operations.manage` for assigned work; admin review/launch gate | **Complete as ledger; intentionally manual as readiness** (`lib/operational-controls.ts:38-52`, `app/manage/readiness/page.tsx:62-365`) |
| `/manage/cases`, nested case number; contain, investigate, CAPA/recall, close | Severity, owner, containment, root cause, actions, effectiveness, evidence, event history | `operations.manage`; assigned lead → admin closure | **Complete/partial**: workflow is guarded; mock recall/SLA escalation rehearsal absent (`app/manage/cases`, `lib/operational-cases.ts`) |
| `/manage/activity`; review merged internal history | Role-filtered append-only domain events and queue counts | Session; investigation across domains | **Partial**: Zelle, feedback, notices, cases, reports, coupons, hazcom, shipping/returns are not first-class timeline domains (`lib/activity.ts:25-53,291-303`) |
| `/manage/reports`; download orders/lots/shipments/affiliates CSV | Period-bounded CSVs containing operational, customer, and financial data | Admin navigation; API currently account-approval guard | **Complete export path; control partial**: no export audit or scheduled reconciliation (`app/manage/reports/page.tsx:25-75`, `app/api/manage/reports`) |
| `/manage/affiliates`; partner terms/referrals/commissions | Referral binding, verification, accrual/vesting/reversal; admin API | Admin; partner → independent verification → payout | **Complete/partial**: approval/compliance/payout manual (`app/manage/affiliates`, `lib/affiliates.ts:330+`) |
| `/manage/coupons`; create/toggle promotional rules | Date/limit/free-shipping settings and actor; concurrent redemption rule | Admin; campaign policy → code → redemption | **Complete/partial**: no campaign approval/dual review (`app/manage/coupons`, `app/api/manage/coupons/route.ts:39-81`) |
| `/manage/hazcom`; issue hazard communications and labels | SDS/product snapshot, hazard label render/issue records | Admin navigation; QC/catalog evidence → issue decision | **Complete/partial**: depends on real hazard evidence and issue approval (`app/manage/hazcom`, `lib/hazcom.ts:20-136`) |
| `/manage/staff`, `/manage/staff/[id]`; create, deactivate, role-change, reset, revoke | Staff users, sessions, append-only staff events; one-time password shown once | `staff.manage`/admin; admin → named seat → access review | **Complete/partial**: last-admin and session controls are strong; names/backups/quarterly review manual (`app/manage/staff/page.tsx:24-129`, `lib/staff-admin.ts:8-19`) |
| Documents and generated downloads: lot COA/SDS/labels, issued documents, invoice, packing slip, shipping label PDF, report CSV | Object storage/document metadata; downloads do not normally mutate records | Domain-specific quality/fulfillment/staff checks; evidence handed to customer, carrier, or controlled repository | **Complete/partial**: object read authorization tested; export attribution and provider retention remain gaps (`app/api/manage/documents/[id]/route.ts:32-63`, `tests/staff-document-authorization.test.ts:106-143`) |
| Scheduled/background jobs: digest, affiliate vest/reversal, waitlist, USPS tracking, marketing consent, quote cleanup | Bounded durable mutations; errors recorded and runner continues | Scheduler token or worker; job → queue/exception review | **Complete/partial**: provider delivery and genuine tracking rehearsal remain external (`app/api/digest/route.ts:5-26`, `lib/scheduled-jobs.ts:2-30`) |

## 3. Workflow and operator assessment

### Normal paths and handoffs

* Dashboard-to-order triage is the clearest path: queue tiles deep-link to
  filtered work, orders show owner/due and `orderNextStep`, and order detail
  exposes allocation and next handoff (`app/manage/page.tsx:49-145`,
  `app/manage/orders/page.tsx:145-168`,
  `app/manage/orders/[orderNumber]/page.tsx:168-217`).
* The intended supplier → PO → receipt → QC/release → catalog → checkout →
  payment → pick/pack → carrier → delivery → return/refund → report chain is
  represented in code and a synthetic staging walkthrough, but not by a
  named-team rehearsal or real provider evidence
  (`docs/OPERATIONS_AUDIT_AND_BUILD_PLAN_2026-09-08.md:76-82,154-168`).
* Staff, control, case, lot, notification, and payment records generally
  preserve actors and history. The unified activity view does not cover every
  domain, so an operator must know where each local history lives
  (`lib/activity.ts:25-53`).

### Exceptions and recovery

Payment attempts use durable pre-provider claims and require reconciliation on
uncertain outcomes; labels have failed/clear/refund/reconcile paths; returns
quarantine stock; Zelle distinguishes claims from verified receipts
(`db/commerce-schema.ts:12-91`, `app/api/manage/orders/[orderNumber]`,
`app/manage/payments/zelle/page.tsx:71-73,185-239`). These are strong
software controls. Legacy refunds with unknown amounts, external email
delivery, live tax/payment/carrier settlement, and backup restore are
intentionally/manual or blocked rather than silently automated.

### Search, filtering, bulk, and status clarity

Orders now use owner, due-date, payment, status, and text filters. Lots and
verification use server-side text/status filters with 50-row pagination.
Responsive card views summarize owner, due date, blocker, next action, and
latest evidence without forcing horizontal scrolling on phones
(`app/manage/orders/page.tsx`, `app/manage/lots/page.tsx`,
`app/manage/verification/page.tsx`, `lib/order-queue.ts`,
`lib/lots-admin.ts`, `lib/organizations.ts`). The current operating policy
approves no bulk assignment action: it remains deliberately unavailable until
an owner approves selection, due-date, partial-failure, and handoff rules. The
existing single-order handoff remains the only assignment mutation and retains
its conditional marker/event audit guard, so every assignment is attributable
and concurrency-safe.

### Accessibility, keyboard, and mobile

Forms have visible labels and many outcome messages use `role=status` or
`role=alert`. Native links, forms, selects, and `<details>` are keyboard
compatible. However, tables omit `scope="col"`, the navigation has no skip
link or `aria-current`, focus-visible treatment is inconsistent, and there
is no keyboard/bulk queue workflow
(`app/manage/orders/page.tsx:101-109`,
`app/manage/payments/zelle/page.tsx:251-253`,
`app/manage/layout.tsx:31-146`). Minimum-width tables (900px orders; similar
lots, verification, Zelle) force horizontal scrolling on phones. The flat
wrapping navigation has no grouped/mobile menu or breadcrumbs
(`app/manage/layout.tsx:34-125`).

### Failure handling and evidence

Notifications and lot uploads expose some retry/error states, while many
success/error query messages only say “recorded” and do not explain recovery
(`app/manage/notifications/page.tsx:69-77,165-213`,
`app/manage/lots/[lotNumber]/page.tsx:101-165`). Zelle approval requires
manually typing an order number without autocomplete or an explicit
customer/amount confirmation (`app/manage/payments/zelle/page.tsx:215-239`);
this is a preventable near-match risk. Queue rows rarely show latest evidence
or last actor, requiring drill-down.

## 4. Security and control audit

### Strengths

* Passwords use PBKDF2-SHA256; unknown users incur a real hash cost; ten
  failures trigger a 15-minute lockout (`lib/staff-auth.ts:8-18,63-105`).
* Cookies are HttpOnly, SameSite=Lax, expiring bearer tokens; only hashes are
  stored, and sessions check expiry, revocation, and active user state
  (`lib/staff-auth.ts:147-194`).
* One-time-password sessions can only reach password/sign-out paths, and
  password changes revoke other sessions (`lib/staff-auth.ts:197-236`,
  `lib/staff-admin.ts:227-245`).
* Same-origin checks protect auth/destructive POSTs and return paths are
  constrained to `/manage` (`lib/staff-auth.ts:290-319`).
* Role changes/deactivation use optimistic markers and SQL last-admin
  invariants; deactivation revokes sessions (`lib/staff-admin.ts:80-175`).
* Sensitive document authorization happens before object reads and is covered
  by tests (`tests/staff-document-authorization.test.ts:99-144`).

### Findings

| ID | Severity | Finding and evidence | Impact |
| --- | --- | --- | --- |
| SEC-01 | High | `finance.manage` is declared but not the consistent guard; shipping refund/reconcile uses `canFulfil` (`lib/staff-roles.ts:5-16,38-51`, `app/api/manage/orders/[orderNumber]/shipping/refund/route.ts:13-21`). Payment/refund routes reuse account approval. | Ops or QC may receive financial/destructive authority inconsistent with the operating model; no second approver. |
| SEC-02 | High | CSV routes authorize through `canVerifyAccounts` and emit customer addresses, emails, payment/refund status and margins; no export event, purpose, re-authentication, rate limit, or confirmation (`app/api/manage/reports/orders.csv/route.ts:7-25`). | Sensitive data exfiltration is difficult to detect or attribute. |
| SEC-03 | Medium | Staff password reset has no current-state predicate/idempotency key; concurrent submissions can invalidate the first one-time password (`lib/staff-admin.ts:178-191`, `app/manage/staff/actions.ts:60-96`). | Admin and recipient confusion; reset race can strand the operator. |
| SEC-04 | Medium | Secure-cookie choice trusts `x-forwarded-proto`; safe only if the deployment proxy strips untrusted values (`lib/staff-auth.ts:147-156,312-319`). | Direct HTTP exposure or header spoofing could weaken bearer-token transport. |
| SEC-05 | Medium | Attribution is uneven: staff changes are append-only, but exports have no event and shipping-refund route-level evidence is not asserted (`lib/staff-admin.ts:8-19`, `app/api/manage/orders/[orderNumber]/shipping/refund/route.ts:36-43`). | Investigation and separation-of-duty review may not prove who acted or why. |
| SEC-06 | Medium | No explicit exceptional-release countersignature/dual-control path was found; the three-person model is recommended, not issued (`docs/THREE_PERSON_OPERATING_MODEL_2026-09-09.md:3,32-42`). | A broad admin can perform emergency work without required independent review. |
| SEC-07 | Low | Direct POST authorization, export leakage, forwarded-header behavior, reset races, and destructive idempotency are not comprehensively tested; existing tests focus on visibility/throttle/read authorization (`tests/staff-control-visibility.test.ts:79-108`, `tests/sign-in-throttle.test.ts:44-73`). | Regressions can pass CI while direct API behavior is unsafe. |

## 5. Proof matrix and stale assumptions

| Capability | Unit/integration/route proof | Browser/rehearsal/docs | Remaining proof |
| --- | --- | --- | --- |
| Staff auth/admin | `tests/staff-auth-core.test.ts`, `staff-rules.test.ts`, `staff-control-visibility.test.ts`, `manage-action-read-failures.test.ts` | Three-person model and operations audit | Named people/backups, MFA decision, access review, complete direct-POST matrix |
| Controls/cases | `tests/operational-controls.test.ts`, `control-assignment.test.ts` | Operations audit control register | Real owners/evidence, approval, mock recall/CAPA, SLA escalation |
| Catalog/lots/quality | catalog/readiness, lot rules, COA, document and hazcom tests | COA intake and SOP drafts | Real prices, manufacturer/address, COA/SDS, physical stock, specifications, training |
| Procurement/inventory | procurement transactions/quantity, lot transaction/correction/quantity tests | Operations audit and SOP-001/002 | Issued PO/transmission/AP match, count/damage evidence, supplier rehearsal |
| Orders/checkout | cart, quote, order, payment-attempt, reservation, shipping, return/refund tests | Phase 9 and staging synthetic order rehearsal | Live rail/tax/carrier, approved policies, full named-team exception rehearsal |
| Zelle/refunds | `zelle.test.ts`, payment/refund/reconciliation tests | Bank-payment rehearsal and operations audit | Historical transfer evidence remains to be verified (Task 48); Task 35 completed the code-side investigation; stale Zelle message cleanup (Task 34) and live reconciliation remain |
| Notifications | notification, provider, route, links, scheduled-job tests | Notifications runbook; one staging inbox proof | Non-order durability, bounce/complaint events, recipient/credential evidence (Task 16 overlap) |
| Reports/exports | CSV/report transaction tests | Commerce analytics docs | Export authorization/audit and bank/CPA reconciliation |
| Deploy/continuity | environment, deploy, health, backup scripts/tests | rollback and backup runbooks | Real D1/R2 restore/RTO and retained failed-release evidence (Tasks 38/39/44 overlap) |

Stale documentation must not drive decisions:

* `docs/TEAM_TESTING_READINESS.md:39-49` predates later phases and calls
  refunds, procurement, dashboard, and deployment work missing; later
  evidence says these are built/tested, with operational proof still absent.
* `docs/CAPABILITY_REAUDIT_2026-09-08.md:20,52` predates reservations and
  durable order notices; current reservations are covered by
  `tests/inventory-reservations.test.ts` and Phase 9
  (`docs/OPERATIONAL_READINESS_PHASE9.md:40-43`).
* Passing the current test suite is not launch approval. The authoritative
  distinction is Built / Verified / Operationally ready
  (`docs/OPERATIONS_AUDIT_AND_BUILD_PLAN_2026-09-08.md:13-22`).

## 6. Severity-ranked findings and ownership split

### P0 — do not enable real selling or live fulfillment

* **P0-01, business approval/data:** seed and approve controls, names/backups,
  prices, released inventory, manufacturer and quality evidence.
* **P0-02, provider/configuration:** approve and activate payment, tax, email,
  shipping, refunds, and carrier policies; synthetic success is not settlement.
* **P0-03, continuity/operations:** prove protected staging, D1/R2 restore,
  rollback, RTO, and named-team rehearsal.

These are not merely software tickets
(`docs/OPERATIONS_AUDIT_AND_BUILD_PLAN_2026-09-08.md:84-93`).

### P1 — high-impact software/control work

* SEC-01 finance/refund least privilege and dual control.
* SEC-02 export authorization, minimization, purpose and audit history.
* SEC-03 reset concurrency/idempotency and SEC-04 trusted proxy invariant.
* Add direct route/API authorization and destructive-action race tests.
* Add queue search/pagination/bulk assignment or explicitly document a volume
  ceiling; add consistent owner/due/next-action fields.

### P1 — policy/training/manual work

Approve exceptional release and emergency-admin review, service levels,
refund/remedy rules, supplier/PO thresholds, tax treatment, retention,
dangerous-goods handling, and issue the SOP/manual library after named
operator walkthroughs and acknowledgements
(`docs/THREE_PERSON_OPERATING_MODEL_2026-09-09.md:15-38`,
`docs/OPERATIONS_AUDIT_AND_BUILD_PLAN_2026-09-08.md:170-176`).

### P2 — usability and scale

Grouped/mobile navigation, breadcrumbs, current location, skip link,
`scope="col"`, focus-visible styling, responsive priority views, cross-domain
activity coverage, Zelle order lookup/confirmation, and evidence/last-actor
summary columns.

## 7. Recommended implementation sequence

1. Business owners seed authority, controls, approved catalog/quality/stock,
   and operating policies; do not enable production based on this document.
2. Fix SEC-01/02 and add direct API/security/concurrency tests before adding
   convenience features.
3. Execute the combined provider, continuity, and named-team rehearsal after
   required credentials and approvals exist.
4. Improve queue scale and accessibility based on observed first-cycle volume.
5. Issue controlled SOPs and record training, correction, acknowledgement, and
   review dates.

## 8. Deduplicated follow-up backlog

| ID | Follow-up and acceptance outcome | Type/dependencies | Existing-task reconciliation |
| --- | --- | --- | --- |
| A | Replace finance/account-approval reuse with explicit finance/report permissions; gate payment/refund/label-refund; implement dual approval where policy requires; add direct unauthorized POST tests. Acceptance: admin/QC/ops matrix passes for page/action/API and every financial/destructive event has actor and independent approval. | Software; member approval of authority first | New finding; not a duplicate |
| B | Add export data minimization, explicit purpose/confirmation, export event, and retention/alerting. Acceptance: sensitive CSV download is denied outside approved role, logged with actor/purpose/period, and test fixtures prove no unnecessary credential/customer fields. | Software + retention policy | Distinct from Task 16’s staging checkout-log scope |
| C | Make staff password reset concurrency-safe/idempotent and enforce trusted proxy/header deployment invariant. Acceptance: duplicate submission yields one usable OTP; direct untrusted forwarded headers cannot weaken cookie transport. | Software + deployment configuration | New finding |
| D | Add scalable queue triage: server-side lot/verification search and pagination, order multi-filters, bulk assignment only where policy allows, consistent due/owner/next-action summaries. Acceptance: representative high-volume fixture remains usable on keyboard/mobile and every bulk operation is attributable. | Software + volume policy | New finding |
| E | Conduct the named three-person authority, exceptional-release, access-review, and SOP walkthrough; record owners/backups, approvals, corrections, acknowledgements, and review dates. | Policy/training/business approval | Includes Task 47’s audit outcome; not a duplicate of existing release/deploy tasks |
| F | Populate approved catalog, supplier, quality, inventory, PO, parcel, tax, and shipping evidence; reconcile a witnessed physical count. Acceptance: no launch-critical control is “ready” without current evidence and a named owner. | Data/provider/business approval | New; does not duplicate payment-after-restock tasks |
| G | Run one named end-to-end supplier → close rehearsal including recall/CAPA, external-boundary failures, handoffs, reports, and customer communication. Acceptance: all variances have owners/dates and no unresolved P0 remains. | Operational rehearsal/training | New; separate from Tasks 43/44 |
| H | Extend unified activity and exception reporting to Zelle, notifications, feedback, cases, coupons, hazcom, shipping/returns, and exports. Acceptance: an investigator can trace each mutation from actor to evidence without switching undocumented systems. | Software | New; Task 34/35 remain historical payment cleanup |

### Explicit reconciliation of current tasks

* **Tasks 2, 38, 39, 44:** release/change safety, GitHub preflight, explicit
  deploy approval, and failed-release evidence are existing work. This audit
  records their operational dependency but does not create another release
  task.
* **Tasks 12 and 13:** PR browser baseline and declined research-use browser
  coverage remain the single existing browser-validation stream; not repeated
  here.
* **Task 16:** checkout log credential secrecy remains existing scope. Backlog
  B extends the concern to export and non-checkout staff data without
  duplicating that task.
* **Tasks 25 and 26:** future-stock consent/payment remains the existing
  product decision and implementation stream. This audit treats current
  waitlist behavior as intentionally notification-only.
* **Task 30:** cart stale-quantity safety remains existing scope.
* **Task 34:** stale Zelle checking messages remain an existing cleanup item.
* **Tasks 35 and 48:** the code-side historical refund investigation is
  implemented; verified transfer evidence remains separate follow-up work.
  This audit does not infer a financial result without that evidence.
* **Task 43:** refund regression coverage remains the existing release-testing
  stream; A concerns broader role/dual-control authorization, not duplicate
  regression work.

## 9. Audit conclusion

The internal tools are a credible transactional foundation, not a substitute
for an issued operating system. Software is strongest where it records an
immutable event, validates state transitions atomically, and exposes a
recoverable exception queue. The immediate risk is not absence of screens; it
is authority drift, sensitive export attribution, insufficient queue scale,
and treating code-complete controls as approved operational evidence. The
application should remain closed to real acceptance until P0 business,
provider, continuity, and rehearsal evidence is supplied and the high-risk
authorization/export findings are resolved.