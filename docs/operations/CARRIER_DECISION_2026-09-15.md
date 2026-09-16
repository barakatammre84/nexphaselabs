# Shippo or direct USPS — the decision

**15 September 2026.** Written to settle the question rather than revisit it.
Both integrations are built and tested; this is a choice between two working
paths, not a build estimate.

---

## The number that decides the money question

USPS **commercial** pricing has **no volume requirement**. Any shipper gets it
by buying postage electronically, from their first parcel. It is not a reward
for scale, and no platform can obtain a rate a direct shipper cannot.

So the real gap is not Shippo-versus-USPS. It is **commercial versus retail**:

| Parcel (zone 7) | Retail | Commercial | Gap |
| --- | --- | --- | --- |
| Ground Advantage 1 lb | **$11.95** (measured live) | ~$7.61 | **−36%** |
| Ground Advantage 3 lb | **$18.95** (measured live) | ~$8.64 | **−54%** |
| Priority Mail 1 lb | **$15.60** (measured live) | ~$12.97 | −17% |

The retail figures are this account's own, measured against the live USPS API on
15 September. The commercial figures are published rates for the same service.

**At 200 parcels a month, being on the wrong side of that line costs roughly
$870 a month.** Shippo's own fee — $0.05 a label, waived when using Shippo's
carrier rates, on a free plan with no monthly commitment — is between $0 and $10
at that volume. **The platform fee is a rounding error. The rate tier is
everything.**

## Which means the cost comparison collapses

Both paths land on the same commercial rates:

- **Shippo** gives them **today**, on signup, no volume commitment.
- **USPS direct** gives them **after USPS grants the pending request**.
  Right now `priceType: COMMERCIAL` returns *403 — the requested contract
  information is not authorized*, so direct sells at **retail**.

Long run the two are financially identical to within pennies a label. **Until
USPS answers, direct costs about 36% more per parcel.** Cost therefore does not
choose between them; it only says *do not ship at retail*.

---

## Operations: the honest ledger

Where they genuinely differ.

**Shippo is better at one thing that matters:** refunds. When a label is voided,
Shippo reports the refund status through its API, and the existing code
reconciles it automatically. USPS cannot. Cancelling an unmanifested label is
clean, but once a label is manifested a cancellation becomes a **refund
dispute** with a `disputeId`, and USPS exposes **no endpoint to read its
outcome**. The code correctly reports such a label as unresolved and keeps it out
of the shipped path until a human checks the Business Customer Gateway. Going
direct means accepting that manual step on every voided-after-manifest label.

**Direct is better at one thing that matters:** no intermediary. No third party
holds a copy of consignee names and addresses tied to research-material orders,
and no third party's commercial terms sit between this business and the mail.
For a business whose whole architecture is about traceability, that is a real
argument — just not a financial one.

**Everything else is close to a tie.** Tracking works either way (Shippo's is
built and running; USPS Tracking 3.2 is granted and tested but not yet ported).
Address validation exists on both, though USPS's now needs a self-service
licence. SCAN forms and adjustments exist on both, gated on USPS's side.

## The risk nobody should ignore

Shippo's prohibited-goods policy names weapons, **illegal substances and
controlled drugs**, alcohol, tobacco, human remains, stolen goods, live animals
and recalled items. **Research peptides are not named.** The products here are
research materials, not controlled substances, so the policy does not plainly
bite — but "illegal substances and controlled drugs" is an interpretable phrase,
and the stated consequence is *"immediate cancellation of shipments, removal of
listings, permanent bans from platforms and/or carriers."*

This category has already been refused by mainstream payment processors. It is
not paranoid to assume a shipping platform could reach the same conclusion, and
a suspension would stop fulfilment outright.

**USPS is not a comparable risk.** It is a common carrier; its mailability rules
apply to the parcel whichever route the postage is bought through, but there is
no commercial relationship to lose.

---

## Decision

**Launch on Shippo. Keep direct USPS built, configured and one word away.**

1. **Cost says use whatever is on commercial rates now.** That is Shippo. Waiting
   for USPS while shipping at retail would burn roughly a third of postage for
   no benefit.
2. **Operations mildly favour Shippo** — automatic refund reconciliation against
   a manual USPS dispute process.
3. **Risk favours having both**, which is exactly the position the last two days
   of work bought. A Shippo suspension stops being an emergency and becomes
   `SHIPPING_PROVIDER=usps`.
4. **There is no revenue yet.** With zero orders, optionality beats optimisation.
   The goal is a first order, not a perfect per-label economy.

### When to revisit, and on what evidence

- **USPS grants the request.** Re-run `scripts/usps-live-check.mjs`; if
  `priceType: COMMERCIAL` returns prices rather than 403, the rates are equal and
  the decision becomes purely about the intermediary. Switching is then a
  judgement call, not an economic one.
- **Shippo restricts or questions the account.** Switch immediately; that is what
  the second path is for.
- **Volume passes roughly 400 labels a month.** Only then does Shippo's per-label
  fee justify looking at its $19/month plan — and that is still noise beside the
  rate tier.

### What this does not decide

Production cannot accept an order at all until `TAX_PROVIDER` is configured — see
`PRODUCTION_SHIPPING_GAPS.md`. **The carrier question was never the thing
standing between this business and its first sale.** Tax is.
