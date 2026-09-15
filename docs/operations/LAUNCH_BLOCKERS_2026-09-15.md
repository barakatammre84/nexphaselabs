# What is actually blocking launch

**Verified live 15 September 2026**, not read from notes: production D1 queried
directly, the public domain fetched, the production worker's health checked.

The short version: **the software is not the blocker and has not been for some
time.** Production is healthy and empty. What stands in the way is inventory
records, configuration, and one $5 purchase.

---

## 1. There is nothing to sell — the real blocker

Production D1, queried 15 September:

| products | lots | released lots | lot documents | orders |
| --- | --- | --- | --- | --- |
| 5 | **0** | **0** | **0** | 0 |

The compliance architecture refuses to sell material that is not on a released
lot, and release is blocked server-side until a lot has a COA, a passing identity
test, a purity figure, remaining quantity, and the manufacturer's **name and
street address**. Nothing about that is a setting — it is `lib/lot-rules.ts`
implementing 16 CCR 1736.9(d), and it is meant to be hard.

So the storefront could be perfectly configured and still sell nothing.

**To clear it:**

- **GHK-Cu is the only sellable line.** Both tirzepatide lots have no COA, so the
  release blockers will refuse them; the bacteriostatic-water COA carries no
  batch number.
- The **COA must be uploaded to the production R2 bucket** — `lot_documents` is 0,
  so no document exists in production at all.
- **Manufacturer name and address** are already researched and verified against
  two independent sources: *ILS Labs Inc., 8222 Vickers St, Suite 106, San Diego,
  CA 92111*. Confirm it matches the actual COA before it goes on a permanent lot
  record.
- **Ammre performs the release himself** in `/manage`. It is a named, recorded
  act and is deliberately not something Claude can do.

## 2. Prices

Only BPC-157 ever had prices and they were synthetic staging values. The other
pack sizes are unpriced. A published product with no price cannot be sold.

## 3. Production configuration — seven variables, zero secrets

Staging holds thirteen secrets; production holds none. Everything below is
Claude's to set the moment the values exist.

- **Shipping** — needs a **live** Shippo key (the code refuses a test key in
  production by design), the live carrier-account ID, the ship-from origin
  including Saturday's PO Box number, plus `SHIPPING_PROVIDER`,
  `LIVE_SHIPPING_ENABLED` and a webhook token.
- **Tax** — the position is settled and configured **in staging only**.
  `TAX_PROVIDER=cdtfa` and `CDTFA_DISTRICT_RATE=destination` still have to be set
  on production. No vendor, no lead time. See `SALES_TAX_POSITION_2026-09-15.md`.
- **Email** — no credentials, so no order confirmation or shipping notice can
  send. Same values as staging.
- **`POLICIES_COUNSEL_REVIEWED`** — counsel review is complete, but without this
  variable all six legal pages still show customers a DRAFT banner.
- **Zelle receipt reader** — absent. Manual payment review works at launch
  volume; it should be a decision, not a surprise.

## 4. The Cloudflare plan — a $5 purchase, and it is not optional

The account is on the **Workers Free** plan, which allows **10 ms of CPU per
request**. Staging product pages were measured at **30–139 ms**, which is what
produced the intermittent site-wide `Error 1102` outages. Separately, since
**1 September 2026** D1 queries on Free **hard-fail** — not throttle — past the
daily row limits, and this build is deliberately write-heavy because the
compliance ledger is append-only.

**Going live on the apex domain while on Free means intermittent outages under
ordinary traffic.** Workers Paid is **$5/month** and lifts CPU to 5 minutes per
request. It is a purchase, so it is Ammre's action, not Claude's.

## 5. The cutover itself

`nexphaselabs.net` still serves the **WordPress** store — verified, 119
WordPress/WooCommerce references in the live HTML. The new site runs at
`nexphaselabs.ammre.workers.dev` and is healthy. DNS is under Ammre's control, so
the cutover is unblocked; it simply has not been done. Sequence is in
`GO_LIVE_RUNBOOK.md`.

**While the old site is up it is still selling NexPhase-3R, NexPhase-2T and
Tesamorelin** — the three lines withdrawn for regulatory reasons. That is a live
exposure for every day the cutover waits, and removing them is Melissa and
Wisam's call.

---

## The order that actually gets to a first sale

1. **Buy the $5 Workers Paid plan.** Smallest action on the list, and without it
   the launch is unstable whatever else is done.
2. **Upload the GHK-Cu COA and enter the lot**, then release it. This is the
   long pole and nothing else substitutes for it.
3. **Set the prices.**
4. **Hand over the Shippo live key and carrier ID**; Saturday brings the PO Box.
5. Claude sets every production variable and secret in one pass — tax, email,
   shipping, the legal banner.
6. Rehearse end to end on staging, then cut the domain over.

Steps 1, 2 and 4 are Ammre's. Step 5 is Claude's and takes about an hour once
the values exist. **Nothing on this list requires writing code.**
