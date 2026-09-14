NexPhase Operating System
- 
- 
- 

 NexPhase Labs · 8486 Ventures
 Build plan
 2 September 2026

# The operating system, in the order it has to be built

 You already have the hardest piece and it isn't the storefront. What follows is what to build yourself, what to buy, what to leave alone, and the sequence that gets you to a first order without rework.

 Customer
Two tiers — consumer and verified institutional

 First order
~26 weeks, built properly

 Budget
Tools and hosting only

 Built by
You, with AI — no contractors

 Start here- lots
- lot_tests
- lot_movements
- /api/lots/[lot]

## 01 — InventoryWhat you already have

 Your db/schema.ts is not a starter file. It is a controlled-substance-grade inventory model, and it makes four decisions that most operators in this category never make at all:

 - Lots default to quarantine. Nothing becomes sellable until a named person releases it and the release records who and when. There is no implicit path to available.

 - Nothing is ever deleted. Corrections are new rows pointing back at what they replaced. That is what an inspector, an underwriter and an acquiring bank each ask to see.

 - manufacturerName and manufacturerAddress are required before release, because California 16 CCR 1736.9(d) says a COA from a distributor doesn't count.

 - lot_movements is an append-only ledger with a named consignee on every shipment, modelled on 21 CFR 1304.21 — the only articulated federal standard for this.

 The public lookup endpoint is equally careful: only released lots resolve, and unreleased lots return 404 rather than leaking that they exist. Movement records are never reachable from it.

 What this means for the plan
 The inventory system you asked for is roughly 60% designed and 0% usable, because there is no interface to put anything into it and nowhere to store the documents. That gap — not the storefront — is what the first three phases close.

 The ruleBuild what is specific to you. Buy what is already solved and audited. Defer what has no users yet.

## 02 — ScopeBuild, buy, defer

 The instinct with "full operating system" is to build all of it. That is how solo founders spend a year and launch nothing. The dividing line is whether a thing is specific to your compliance position, or a solved problem someone else already carries the liability for.

#### Build

 Nothing off the shelf does lot-level release control or a consignee ledger. This is also the moat.

 - Document storage for COA, SDS, chromatogram, mass spec

 - Catalog manager — add a product without touching code

 - Lot intake, test capture, named release

 - Accounts with two verification tiers

 - Orders and fulfilment, writing to the movement ledger

 - Tier-aware pricing visibility

#### Buy

 Solved, audited, and recognised by the people who will examine your business.

 - Accounting — QuickBooks, never a homemade ledger

 - Payments — ACH plus self-hosted crypto

 - Transactional email

 - Shipping labels and tracking

 - SDS authoring

#### Defer

 Real, but worthless before you have customers or a licence.

 - CRM software — your accounts, orders and movements already are the customer record

 - Marketing automation

 - Warehouse management beyond lots

 - The telehealth and prescriber layer

 On accounting specifically
 Do not build a general ledger. Your CPA, your bank, your insurer and any future acquirer all need books they recognise, and a homemade ledger is not merely extra work — it reads as a red flag in exactly the diligence conversations that matter in this category. What you build is the operational record that feeds accounting: orders, cost per lot, shipments. That syncs out.

 On CRM specifically
 You have zero customers. A CRM at zero customers is a filing cabinet you pay rent on. Your accounts table plus orders plus lot_movements already contains everything a CRM would hold — who they are, what they bought, where it went, when. Add notes and follow-up tasks on top of that in month seven, when there is something to follow up on. Note also that the mainstream CRMs have acceptable-use terms worth reading before you commit to one.

 SequencingEach phase ships something usable. Nothing depends on a phase that hasn't shipped.

## 03 — PhasesTwenty-six weeks

 The order is not arbitrary. Each phase unblocks the next, and none of them requires throwing away earlier work. The numbering is a real dependency chain, not a schedule you can shuffle.

 P1Storage and deploymentWeeks 1–3

 Your hosting config currently reads "r2": null. Meanwhile coaKey, sdsKey, chromatogramKey and massSpecKey are sitting in the schema waiting for a bucket that doesn't exist. Nothing else can be built until documents have somewhere private to live.

 Also settled here: database migrations run properly, a staging environment separate from production, and secrets handled outside the repo.

 ShipsA private file store where a COA can be uploaded and retrieved by lot, and a deploy you can roll back.

 P2Catalog managerWeeks 4–8

 Right now adding a product means editing lib/catalog.ts by hand. That is the single biggest brake on everything you want — catalog breadth, format expansion, SEO pages. It has to move into a form you can use.

 The important part is that the schema rules in that file's header become enforced by the form, not remembered by you at 11pm. No dose field exists to fill in. Solubility only accepts laboratory solvents. Every published figure requires a source note before it saves.

 ShipsYou add BPC-157 in four pack sizes and three presentations without opening an editor, and the rules hold whether or not you remember them.

 P3Lot intake and releaseWeeks 9–13

 The workflow the schema already anticipates: receive a shipment, record what arrived and from which manufacturer, attach the COA and chromatogram, enter test results one row per test, then release under a named person — or hold it with a reason.

 This is where the business becomes real rather than notional. It is also the part that, done properly, you can show a bank.

 ShipsA received lot moves quarantine → released, and the public lot lookup resolves it with its documents attached.

 P4Accounts and the two tiersWeeks 14–17

 Two paths from one sign-up. Consumer accounts: email, terms, RUO acknowledgement. Institutional accounts: organisation email domain, no residential shipping, documents reviewed by you in a queue, then approved.

 Tier drives what a visitor can see — pricing, lot availability, bulk quantities, terms. Build that as a rule on the account, not as two separate storefronts, or you will maintain everything twice forever.

 ShipsSomeone signs up, sees consumer pricing; a lab submits verification, gets approved, sees institutional pricing on the same pages.

 P5Orders, checkout, paymentsWeeks 18–22

 Cart, order, fulfilment, tracking. The non-obvious requirement: every shipment must write a row to lot_movements with the actual consignee and the actual ship date — not the order date. That link is the whole point of the ledger, and retrofitting it later is painful.

 Payments are the risk in this phase and the reason it needs research started in week one, not week eighteen. See the decisions section.

 ShipsA real order, paid, picked from a released lot, shipped, and recorded against the consignee.

 P6Books, reporting, launch checksWeeks 23–26

 Accounting connected and reconciling. Cost per lot flowing through to margin per order. The reports you will actually be asked for: inventory on hand by lot, movement history for any consignee, revenue by product.

 Then the unglamorous launch list — terms, privacy, shipping policy, returns, tax registration, and the SDS set.

 ShipsA month closes cleanly, and you can answer "what did we ship, to whom, from which lot" in one query.

 Running alongside from Phase 2: SEO architecture, which is a property of how catalog pages are structured rather than a phase of its own.

 HonestQualified traffic, not category-leading traffic.

## 04 — SearchThe SEO you can actually build

 You said you have lots of product. You have five compounds. That distinction matters, because it determines what search can realistically do for you.

 Page count in this category comes from two places. One is format and pack-size expansion — the same molecule as a vial, a capsule, a spray, at four quantities. That is legitimate merchandising and it multiplies indexable pages honestly. Phase 2 is what unlocks it.

 The other is the content engine: dosage guides, reconstitution calculators, literature summaries beside a buy button. That is where the leaders' traffic actually comes from, and it is the same material quoted inside the warning letters. It is not on this plan.

### What is genuinely underserved

 - CAS registry numbers. Someone searching 137525-51-0 knows exactly what they want. Volume is low, intent is near-total, and almost nobody optimises for it.

 - Per-lot COA pages. Every released lot is a unique, genuinely useful, indexable page that no competitor can duplicate. Nobody in the top ten does this properly.

 - Analytical method content. How purity is determined, what an HPLC chromatogram shows, why identity confirmation matters. Differentiating, compliant, and it is what a real buyer evaluates you on.

 - Chemical identity depth. Sequence, formula, InChI Key, PubChem cross-references — structured properly, these are what search engines use to understand what a page is about.

 Set the expectation now
 This will not produce 232,000 visits a month. It will produce a few thousand highly qualified ones. If the plan depends on category-leading traffic, the plan depends on building the content that draws the letters — and that is a different decision than "let's do SEO," so it should be made deliberately rather than arrived at.

 LaterWhat survives the model change, and what doesn't.

## 05 — ForwardDesigning for the Ro model

 If you get to a prescribing model, most of this survives. That is only true if you avoid one specific mistake: hardcoding "research use only" into the order and product models as though it were a fact about your business rather than a property of a channel.

 Carries overCustomer identity and accounts. Catalog and product data. Inventory, lots and the movement ledger — which becomes more valuable, not less, under a pharmacy model. Document storage. Orders and fulfilment. Accounting.

 Gets addedA prescriber network, an intake questionnaire, a clinical review step, a prescription record, and a 503A or 503B partner. This is an authorisation layer that sits between the order and the fulfilment — which is why the order model must not assume authorisation is automatic.

 Gets replacedThe RUO positioning, the public catalog presentation, the consumer tier as currently conceived, and most of the marketing site.

 Practical consequence for Phase 5: give the order model a channel field and an authorisation reference from the start, even though today every order is the same channel and the reference is always null.

 CostOrder of magnitude. Confirm current pricing before committing.

## 06 — MoneyWhat this costs to run

 Everything below is chosen to fit a tools-and-hosting budget. The figures are approximate and worth checking directly — vendor pricing moves.

 Item
Purpose
From phase
Approx / month

 Cloudflare Workers
Hosting and compute — already your stack
1
$5

 Cloudflare D1
Database — included at low volume
1
~$0

 Cloudflare R2
COA, SDS and chromatogram storage
1
<$1

 Domain
nexphaselabs.net
—
~$2

 Transactional email
Order and verification mail
4
$0

 Payment rails
ACH provider plus self-hosted crypto node
5
TBD

 Shipping labels
Rates, labels, tracking
5
usage

 QuickBooks
Books your CPA and bank recognise
6
~$35

 Before launch / after launch
~$10 / ~$50+

 Payment processing is the only line that could break this budget, and it is the only one you cannot estimate from a price page. Treat it as research, not a purchase.

 YoursThese five are not engineering questions and I should not decide them for you.

## 07 — DecisionsWhat only you can settle

 - Payments, starting now. Stripe, PayPal and Square all prohibit this category outright. Umbrella runs on debit, same-day bank payment, Bitcoin via BTCPay, and direct US bank transfer. Nothing on this plan ships without an answer, and finding one takes months, not days. Start in week one.

 - Whether the consumer tier is really the plan. Everything downstream — verification, pricing, checkout, exposure — turns on this. It is worth one paid hour with a regulatory lawyer before Phase 4, not after.

 - Safety data sheets. You owe these under OSHA regardless of the rest, with a deadline of 20 November. This is the nearest hard date on the page.

 - Entity, insurance, and the manufacturing question. Product liability cover in this category is its own project. And your stated roadmap of repacking and filling vials in-house is a different regulatory posture from reselling sealed material — worth pricing before committing.

 - Whether GLP-1s ever enter the catalog. Recommendation: no. That is where enforcement concentrates and where Novo and Lilly litigate, and they move faster than FDA. Your catalog is clean today; keeping it clean is free.

### About this plan

 Prepared 2 September 2026 for 8486 LLC. Sequencing and scope reflect three stated constraints — two customer tiers, a twenty-six week horizon, and a tools-and-hosting budget with no contractors. Regulatory citations are to primary sources; cost figures are approximate and should be confirmed. Nothing here is legal advice, and decision two in particular is a question for a lawyer rather than for me.

## Phase 7 — Operating tools (added 2026-09-03)

Owner direction: nothing about the offer lives in code; every value staff need to change is data
with a management tool, and the priority is the software needed to run the business day to day.
Same loop discipline as Phases 1–6.

- 7.1 Catalog fully data-driven: chemical classes (label, anchor, blurb, order) as a table managed
  in the catalog manager; product photographs uploaded to R2 through the product form instead of
  repository paths; featured/ordering managed in the manager. Seed remains the only code.
- 7.2 Staff administration: create and deactivate staff, change roles, force password reset,
  revoke sessions, view sign-in history — replaces the CLI script; admin only; every change an
  attributed event.
- 7.3 Customer service tools: customer password reset (email token, same posture as verification);
  staff account lookup showing account, organisation, acknowledgements, orders and sessions;
  resend verification; suspend/reinstate an account with reason; all attributed.
- 7.4 Lot corrections and alerts: correct a lot record by superseding it (new row,
  `supersededById`, reason, nothing edited in place); dashboard alerts for retest dates due,
  quarantine ageing, low quantity on hand, released lots without a current SDS.
- 7.5 Refunds and returns: record a refund against an order (`refund_due` → `refunded` with
  reference and date, customer emailed); receive a return as a ledger movement into a quarantined
  disposition; both in the accounting export.
- 7.6 Procurement: suppliers and purchase orders; expected receipts linked to lot intake so
  provenance and landed cost flow from the PO; open-PO and landed-cost reports.
- 7.7 Operations dashboard and audit trail: `/manage` home with queue counts (verifications
  waiting, orders awaiting payment, orders to fulfil, lots in quarantine, alerts); unified event
  timeline across lots, orders, organisations, accounts and staff; optional daily digest email.
- 7.8 Deployment automation: GitHub Actions build, test and deploy to staging on push and to
  production on tag, migrations applied in the workflow; needs the owner's `CLOUDFLARE_API_TOKEN`
  as a repository secret but removes every other manual step.

## Phase 8 — The documents the business issues (added 2026-09-04)

The system can receive material, test it, release it and ship a prepaid order, but it produces
none of the paperwork that transaction is supposed to generate. Today a lot cannot be released
without uploading a certificate made by hand somewhere else, "invoice by email" sends bank
instructions with no invoice attached, nothing accompanies a shipment, and there is no PDF
generation anywhere in the codebase. This phase gives the business one document spine and the
four documents it owes.

Design rules for the whole phase, derived from how lots already work:

- An issued document is a record, not a view. It is rendered once, stored in R2, and never
  regenerated silently. Corrections issue a new numbered document that supersedes the old one,
  exactly as lot corrections do. Nothing is overwritten and nothing is hard-deleted.
- Every generated document is content-hashed. The hash is stored so a certificate presented in a
  dispute can be proved to be the one that was issued.
- Free text that reaches a customer document passes the forbidden-language scanner at issue time,
  the same as public catalog fields. A certificate is public-facing.
- The layout modules are pure and unit-tested. Only the storage layer touches R2 or D1.

- 8.1 Document spine: `pdf-lib` rendering inside the worker, a pure layout library (page
  furniture, tables, wrapping, the entity block), the entity identity centralised out of the five
  places it is currently duplicated as a string, content hashing, an `issued_documents` table with
  supersession, storage and a staff download route.
- 8.2 Certificate of analysis, issued by us: rendered from the lot record and its test results —
  identity, lot number, manufacturer name and address as 16 CCR 1736.9(d) requires, each test with
  method, result and specification, the analytical laboratory and accession number, retest date,
  storage and the conditions of supply. Preview before issue; issuing writes the `coa` lot
  document so the existing release gate and the existing public route serve it unchanged. A lot
  correction supersedes the certificate.
- 8.3 Invoice: sequentially numbered per calendar year through a guarded claim, the entity and
  bill-to details, order lines, totals, payment instructions and terms. Downloadable by staff and
  by the customer who owns the order. Attached to the order and to the invoice email.
- 8.4 Packing slip: issued at fulfilment, listing each line with the lot number assigned to it,
  the certificate reference and the conditions of supply. No prices, so the slip can travel in the
  box.
- 8.5 GHS container labels and the hazard communication programme: structured hazard fields on the
  product (signal word, hazard and precautionary statements, pictograms, GHS classification) edited
  in the catalog manager rather than buried in `sourceNotes` prose, a label PDF at real container
  sizes carrying product identifier, signal word, pictograms, statements and supplier
  identification, and the written hazard communication programme. Due 20 November 2026.
