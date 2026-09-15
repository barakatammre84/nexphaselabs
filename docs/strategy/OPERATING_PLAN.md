# NexPhase operating plan — status against the "Build Order" brief

Source: claude.ai artifact `38cc7859-fb31-45e4-9851-35a48180b1f9` ("NexPhase Build Order",
dated 2 September 2026). Verbatim text of the artifact as pulled on 2026-09-03 is in
`2026-09-02-build-order-artifact.txt`. This file is the working copy: it tracks each item in
the brief against what exists in this repository and what only the owner can do. Update this
file when the artifact changes or an item moves.

Status key: **Done** · **Built, not exercised** (code exists, no production data) · **Partial** ·
**Not started** · **Owner decision**.

## The one thing to settle first

The brief recommends abandoning the research-reagent business (§2, §5) in favour of a
partner-model longevity brand, and says to stop building the inventory system (§6, "What to stop
doing"). The build plan the owner then chose (artifact `d4947e68…`, executed 2–3 September) did
the opposite: the full institutional research-supply operating system is built, audited and
committed. Both cannot be the plan. Nothing built is wasted under either answer — the entity,
access gate, documentation discipline and lot record carry over, and the code is committed — but
the next dollar spent depends on this call.

- **Owner decision (2026-09-03):** continue the research-supply operating system. No product is
  taken down; the catalog is data managed through the catalog manager and product decisions are
  not made in code. Engineering focus is the software needed to run and operate the business
  (Phase 7 in `docs/BUILD_PLAN.md`). The brief's §5/§6 pivot is not adopted.

## §1 Where you are

| Item | Status | Evidence / gap |
|---|---|---|
| No entity | **Done** | 8486 Ventures LLC (California), doing business as Nexphaselabs, on `/about` and the footer since Phase 6.3. EIN, bank account and whether anything is still transacted personally: owner to confirm. |
| "Prepared in-house" sentence | **Done** | Both blends withdrawn 2 September with reasons recorded in `lib/catalog.ts`; no "prepared in-house" copy remains (only "in-house research laboratory" as a customer type). |
| About-page TODO | **Partial** | Entity, state, trading name, facility city published. Founding year not on record — owner. |
| Access gate | **Done and hardened** | Brief called it the right door. It is now backed by real verification: organisation-domain email, PO-box/residential rejection, human-use statements refused, document upload, named admin decision with event history, and revocation. |
| "The lot is the unit of truth" | **Done** | Quarantine default, named release with blockers (manufacturer name+address, COA, identity, purity), append-only movements, public lookup of released lots only. |

## §2 Reagent-supplier path

The brief scratches the compounding-API supply path (cGMP repackaging, Fagron, PCCA). Nothing in
the repository pursues that path: no repacking, no aliquoting, no relabelling code paths; lots are
received and shipped as sealed containers. The institutional research-reagent catalog is a
different business from compounding-API supply and the brief does not evaluate it — that is
question 1 of the counsel brief (§4). **Owner decision, informed by counsel.**

## §3 Week one — six items

| # | Item | Status | Notes |
|---|---|---|---|
| 01 | Form the entity | **Done** (pending confirmation of EIN/bank) | LLC, California. Brief suggests Delaware C-corp if raising — not chosen. |
| 02 | Take four SKUs down (tesamorelin, BPC-157, selank, both blends) | **Owner decided: no** | Tesamorelin and both blends were withdrawn earlier for recorded reasons. BPC-157 and Selank stay published by owner decision (2026-09-03). Any future change is made as data in the catalog manager, never in code. |
| 03 | Pull the parcel's zoning designation | **Not started** | Owner. One lookup at Oakland Planning. |
| 04 | Inventory the inventory | **Built, not exercised** | Lot intake records compound, quantity, lot, manufacturer and address, supplier, country of origin, customs entry, documents, cost; everything enters quarantine. No production deploy yet, so the physical Oakland inventory is not in the system. Owner: deploy, then intake every container. |
| 05 | Send the counsel brief to three firms | **Not started** | Counsel not engaged (CLAUDE.md). The brief text is in the artifact copy. |
| 06 | Calendar the OSHA date (20 Nov 2026) | **Partial** | Date tracked in PROGRESS. SDS library built (per-product upload, public download, library page). Written HazCom program, GHS labels, training and the consultant engagement: not started. Real SDS PDFs not yet uploaded. |

## §4 Counsel

**Not started.** Five questions in the brief. What this repository already gives counsel: the
site as built, the catalog with sourcing notes per value, the withdrawn-product reasoning, the
verification rules, the lot record and the legal pages (all marked pending counsel review).

## §5 Strategic choice

**Owner decision.** See "The one thing to settle first". Note for the decision: the brief's
"no compounded GLP-1s" rule is already honoured — there are none in the catalog and CLAUDE.md
records "GLP-1s: recommendation is no".

## §6 The build (partner-model brand)

Applies only if the pivot is chosen. Nothing here exists: no brand repositioning, no partner
shortlist or diligence, no LegitScript certification, Oakland lease unresolved. Items 4–12
(states, retention, own MSO) are downstream of that.

If the research-supply path is chosen instead, the brief's "what to stop doing" list inverts:
the inventory system is the product's proof, and the remaining work is owner actions recorded in
`docs/PROGRESS.md` (first deploy, production staff user, email key, payment rail, SDS uploads,
counsel review, consumer-tier decision, insurance).

## §7 What the brief still doesn't know

Owner to answer: money spent so far and recoverability (lease term, inventory outlay); supplier
commitments; time horizon; whether healthcare is wanted at all.

## Built beyond the brief

Not asked for by the brief but in place and audited: verified-account visibility rule (pricing
only to approved institutions), cart and idempotent ordering, payment abstraction (bank transfer,
BTCPay, invoice fallback), fulfilment from released lots with an atomic movement ledger,
customer tracking, accounting exports and on-screen reports, shipping and returns policies,
SDS library, organisation revocation.

## Change log

- 2026-09-03 — First status pass against the 2 September artifact.
- 2026-09-03 — Owner decision recorded: continue research supply, no products removed, build operating tools (Phase 7).
- 2026-09-03 — Phase 7 delivered (all eight steps committed and audited): catalog fully data-driven, staff administration, customer service tools, lot corrections and alerts, refunds and returns, procurement, operations dashboard and timeline, deployment automation. Remaining items are owner actions listed in docs/PROGRESS.md.
