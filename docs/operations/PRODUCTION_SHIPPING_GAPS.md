# What is missing before production can take and ship an order

**Audited 15 September 2026** against the live Cloudflare configuration, not
against notes. Method: read the production vars out of `wrangler.jsonc`, listed
the production Worker secrets, and compared both against what the code actually
requires before it will act.

**Headline: production holds SEVEN variables and ZERO secrets.** Staging holds
thirteen secrets. Production is not a half-configured environment, it is an
unconfigured one. Nothing below is a code defect — the code is finished and
refuses, loudly and in writing, rather than half-working.

---

## A. Shipping — nothing is configured

`shippingConfiguration()` refuses unless all of these are present in production.

| What | Where | Who | Note |
| --- | --- | --- | --- |
| `SHIPPING_PROVIDER=shippo` | var | Claude | One word. Flips to `usps` when USPS grants the request. |
| `SHIPPO_API_KEY` | **secret** | **Ammre** | Must be a **live** key. The code refuses a `shippo_test_` key in production by design, so staging's key cannot be reused. |
| `SHIPPO_CARRIER_ACCOUNTS` | var | **Ammre** | The **live** USPS carrier-account ID from Shippo. Staging's `256b9f9e…` is a test account. |
| `SHIPPO_ORIGINS_JSON` | **secret** | **Ammre** | Ship-from address with phone and email, both of which are validated. **Needs the PO Box number that arrives Saturday.** |
| `LIVE_SHIPPING_ENABLED=true` | var | Claude | A deliberate second gate so a misconfigured deploy cannot buy postage. |
| `SHIPPO_WEBHOOK_TOKEN` | **secret** | Claude generates, **Ammre registers** | Without it, tracking never arrives and orders are never automatically marked delivered. The matching webhook URL has to be registered in the Shippo dashboard. |

## B. Tax — RESOLVED 15 September 2026

Was the binding constraint on this whole list. It is closed.

`TAX_PROVIDER=cdtfa`, `CDTFA_DISTRICT_RATE=destination`, researched from CDTFA's
own publications rather than left as a judgement call — reasoning and citations
in `SALES_TAX_POSITION_2026-09-15.md`. No vendor account, no fee, no lead time;
**TaxJar is not required**. Verified live against CDTFA: Oakland 10.75%, San
Diego 7.75%, out-of-state zero.

**Seller's permit and the rest of the Oakland operating requirements are in
place** — stated by Ammre, 15 September. That was the last open question here.

What remains is not a launch gate but a standing duty: economic nexus has to be
watched per state, and the trap is the ~fifteen states that trigger on
"$100,000 **or 200 transactions**". At a ~$90 order, 200 orders into one of them
creates nexus at roughly $18,000. **Track orders per state, not revenue per
state.** The order data already supports it; nothing builds that alert yet.

## C. Email — no credentials at all

Staging has `EMAIL_PROVIDER` and four `GOOGLE_WORKSPACE_OAUTH_*` secrets.
Production has none, so no order confirmation, shipping notice or receipt can be
sent. Same values, set against production.

## D. Legal pages still show the DRAFT banner

`POLICIES_COUNSEL_REVIEWED` is absent, so all six legal pages carry a draft
banner to customers. Counsel review is **complete** — this is now purely the
mechanical config step that reflects it.

## E. Zelle receipt reading

The `ZELLE_GMAIL_*` read-only credentials are absent, so incoming payment
confirmations are not read automatically and every payment needs manual review.
Workable at launch volume, but it should be a decision rather than a surprise.

## F. Repository hygiene

Fourteen commits sit on `feat/usps-direct-2026-09-15`, **not merged and not
pushed**. Several agents work in this tree; unpushed work is the easiest thing in
the project to lose. This is the cheapest item here and the one with the worst
downside.

---

## Not on this list, and deliberately

Product and lot readiness — production has no published products and no released
lots — is tracked in [[build-state]], not here. So is DNS. This document is only
about what shipping, tax and notification need in order to function.

## The order that gets to a first order fastest

1. **Push the branch.** Minutes, and it stops fourteen commits being one disk
   failure from gone.
2. **Ask the accountant the nexus question.** It is the only item with an
   external lead time, and everything else is inert until tax is configured.
3. **Get the live Shippo key and carrier-account ID.** Unblocks all of section A
   except the origin.
4. **Saturday: the PO Box number**, which completes the origin.
5. Claude sets every var and secret in one pass and runs the end-to-end rehearsal
   already used on 14 September.
