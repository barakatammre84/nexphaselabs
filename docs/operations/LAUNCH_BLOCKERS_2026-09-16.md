# What is left — re-verified 16 September 2026

Supersedes `LAUNCH_BLOCKERS_2026-09-15.md`. Every number below was read live
today: production D1 queried directly, production secrets listed, the apex
domain and the production worker both fetched. Nothing here is from notes.

## What changed since yesterday

Nothing in production. Not one number moved. The work of the last two days went
into the repository — the counsel hold now catches the house codes, the four
certificates are recorded, the Lodi ship-from is written down — and none of it
touches what a customer can buy, because production has no inventory to sell.

## Live state

Production worker: healthy. `db: ok`, `docs: ok`, release `fa58737`.

| | |
| --- | --- |
| Products | 5, all published |
| Variants | 16 |
| Variants with a price | **0** |
| Lots | **0** |
| Lot documents (COAs) | **0** |
| Orders | 0 |
| Settings rows | **0** |
| Operational controls | **0** |
| Production secrets | **0** (staging holds ten) |

The apex domain still serves the WordPress store.

---

## 1. The WordPress store is selling three withdrawn lines, right now

`nexphaselabs.net/shop/` today, with working add-to-cart buttons:

| Product | Price | Status here |
| --- | --- | --- |
| NexPhase-2T | $79.99 | tirzepatide — counsel hold |
| NexPhase-3R | $89.99 | retatrutide — counsel hold |
| Tesamorelin | $54.99 | withdrawn from this catalog |

This is the only item on the list that gets worse while it waits. The new site
refuses to publish all three; the old site takes orders for them. Note also that
it sells them under the house codes — the exact gap closed in `COUNSEL_HOLD`
yesterday, which is what that fix was for.

Per the operating charter, pulling them is Melissa and Wisam's call, not a
solo one.

## 2. Nothing is sellable, and the reason has not changed

Release is blocked server-side until a lot has a COA, a passing identity test,
a purity figure, quantity remaining, and the manufacturer's **name and street
address** (16 CCR 1736.9(d), `lib/lot-rules.ts`).

**No certificate names a manufacturer.** ILS Laboratories is the testing lab.
Until that name and address exist, every lot is blocked — GHK-Cu included, and
GHK-Cu is the one clean line. See `COA_INTAKE_2026-09-15.md` for the per-lot
detail and the exact field values to enter.

## 3. Sixteen variants, none priced

Yesterday's note said BPC-157 had synthetic staging prices. In production the
count is zero across all sixteen. A published product with no price cannot be
sold, so this blocks the storefront independently of the lot problem.

Prices also have no single source of truth right now: the WordPress store says
NP-3R is $89.99, the inventory sheet says the 10 mg is $55. Decide which is
the real number before entering them.

## 4. Four products are published with nothing behind them

BPC-157, beta-NAD+, GHK and Selank are all live and marked available, with no
lot, no stock and no certificate. Only GHK-Cu corresponds to anything in
inventory. They should go to draft until they have lots.

## 5. Production configuration: zero secrets, five missing variables

Staging holds ten secrets. Production holds none.

Missing variables: `TAX_PROVIDER`, `CDTFA_DISTRICT_RATE`, `SHIPPING_PROVIDER`,
`LIVE_SHIPPING_ENABLED`, `POLICIES_COUNSEL_REVIEWED`. Without the last one, all
six legal pages still show customers a DRAFT banner.

Missing secrets: email (Google Workspace OAuth), shipping (a **live** Shippo key
— the code refuses a test key in production by design — plus the carrier account
ID and webhook token), and the Lodi ship-from origin. The USPS credentials are
already proven working in staging.

None of this has a lead time. It is one pass once the values exist.

## 6. `entity.registered_address` and `entity.telephone` are unset

Zero settings rows in production, so the hazard communication programme has no
address to print. The value is the address of the **workplace where material is
handled** — not the Lodi mailbox, which holds no stock.

## 7. Workers Paid, $5

Verified Free on 15 September and not re-checkable from here. Free allows 10 ms
CPU per request against measured 30–139 ms page renders, which is what produced
the intermittent `Error 1102` outages, and since 1 September D1 hard-fails past
the daily row limits rather than throttling. Going live on the apex while on
Free means outages under ordinary traffic.

## 8. The cutover

DNS is under Ammre's control and the new site is healthy on
`nexphaselabs.ammre.workers.dev`. Sequence is in `GO_LIVE_RUNBOOK.md`.

---

## Order of operations

**Today, and it is not a technical task:** pull NexPhase-2T, NexPhase-3R and
Tesamorelin from the WordPress store.

**Then, Ammre's:**

1. Manufacturer name and street address for the GHK-Cu lot. Everything else
   waits behind this.
2. Buy Workers Paid.
3. Upload the GHK-Cu COA, enter the lot, release it in `/manage`. Release is a
   named, recorded act and is deliberately not something Claude can perform.
4. Decide the prices.
5. Shippo live key and carrier account ID — or, if Shippo keeps not delivering
   one, submit the USPS service request for Labels 3.0, Payments 3.0 and Ship
   Enrollment 3.0, which is the route that does not depend on a vendor.

**Then, Claude's, in one pass of about an hour:**

6. Every production secret and variable, including the Lodi origin.
7. Four empty products to draft.
8. Record the registered address and telephone.
9. Rehearse a full order on staging, then cut the domain over.

**Still no code to write.** That was true yesterday and it is true today.
