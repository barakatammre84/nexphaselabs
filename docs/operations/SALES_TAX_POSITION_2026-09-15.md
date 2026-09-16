# Sales tax: what the rules actually say, and what we set

**15 September 2026.** Researched from CDTFA's own publications and the
post-*Wayfair* state thresholds, because the question "which tax setting" turned
out to have a determinate answer rather than a judgement call.

Facts and citations below; the conclusion follows from them. This is rules
research, not a tax opinion — the one thing it does not and cannot do is watch
the thresholds for you, and that is the part in §4.

---

## 1. Outside California: nothing to collect, for now

Since *South Dakota v. Wayfair* (2018) a state may require an out-of-state
seller to collect only once that seller crosses **that state's** economic nexus
threshold.

- About **35 states: $100,000** in sales into the state, sales-only.
- About **15 states: $100,000 or 200 transactions**, whichever first.
- **California, New York, Texas: $500,000.** Mississippi $250,000.
- **Zero sales into a state is zero obligation in that state.** The thresholds
  trigger on crossing, not on intending to sell.

Selling nationally does **not** create a national collection duty. With no
orders yet, NexPhase is below every threshold in the country. The correct
position today is to collect **no tax outside California**.

## 2. Inside California: obligatory, no threshold

There is a business location in Oakland. That is physical presence, so
California sales tax applies to California sales from the first order. No
threshold, no *Wayfair* question. This requires a **CDTFA seller's permit** —
collecting without one is not an option, and it is worth confirming the permit
is live before the first sale.

## 3. The district-tax question, which has a real answer

California's rate is a 7.25% statewide base plus **district** taxes that vary by
locality — Oakland is 10.75%, San Diego 7.75%.

CDTFA Publication 44 sets out two rules that matter here:

- **A retailer whose only location is in a district reports district tax on its
  sales**, unless the goods are shipped or delivered for use outside that
  district.
- For a delivery into a district where the retailer is **not** engaged in
  business, *"the purchaser is generally responsible for reporting and paying
  district use tax."* The retailer is not required to collect it —

— **but may.** CDTFA is explicit: *"As a courtesy to your customers, you may
collect the district use tax from them and report and pay it on their behalf."*
With the obvious condition: *"If you do charge and collect the tax, you are
liable for it."*

Separately, since **25 April 2019** the **$500,000** rule applies to *all*
retailers, **in-state included**: above $500,000 of California sales in the
current or preceding calendar year, district tax must be collected **statewide**
regardless of where the retailer is engaged in business.

### Why "statewide base only" would be the wrong setting

The tempting reading is that below $500,000 only the 7.25% base applies, so the
minimal setting is correct. It is not, for one concrete reason:

**Deliveries within our own district are required to carry the full district
rate.** An Oakland-district customer owes **10.75%**. A statewide-base setting
would collect 7.25% and under-collect by 3.5 points on every one of those
orders — and under-collected sales tax is paid out of the business's own pocket,
with interest.

So the options are not "correct versus over-cautious". They are:

| Setting | In-district CA sale | Out-of-district CA sale | Risk |
| --- | --- | --- | --- |
| `statewide` | **under-collects 3.5%** | legally minimal | pays the shortfall itself |
| `destination` | correct | collects what the customer would otherwise self-report — expressly permitted | must remit what it collects |

**`destination` is the setting.** It is never wrong, never under-collects, is
explicitly allowed by CDTFA, is what most California sellers do, and is exactly
what becomes mandatory at $500,000 — so it never needs revisiting on growth.

## 4. The part that needs watching, and the trap in it

Economic nexus is not a one-time determination. It has to be monitored per
state, and the trap for this business is not the dollar threshold.

**It is the 200-transaction states.** At a $90 order, $100,000 into one state is
over a thousand orders — far away. But **200 orders into a single one of those
fifteen states** creates nexus at roughly **$18,000** of sales there. A
low-ticket seller hits the transaction count long before the dollar figure.

What that means in practice: track **orders per state**, not just revenue per
state, and treat 200 into any one state as the line. The order data to do this
is already in the system.

## 5. What is configured

```
TAX_PROVIDER          = cdtfa      # California only; out-of-state = zero
CDTFA_DISTRICT_RATE   = destination
CDTFA_TAX_SHIPPING    = (unset)    # California does not tax separately stated
                                   # actual shipping by common carrier
```

Verified live against CDTFA on 15 September: Oakland 10.75%, San Diego 7.75%,
rooftop-accurate with jurisdiction and tax area code returned on every order for
the filing record. Out-of-state destinations return zero. No vendor account, no
fee — **TaxJar is not needed** and is off the critical path.

One known edge, handled: CDTFA refuses to geocode PO Box addresses. Those fall
back to the 7.25% base and are marked `ADDRESS NOT GEOCODED` on the order, so the
sale completes and the few affected orders are identifiable at filing.

## Sources

- CDTFA Publication 44 — [Place of Sale](https://cdtfa.ca.gov/formspubs/pub44/place-of-sale.htm),
  [Sales Across District Lines](https://cdtfa.ca.gov/formspubs/pub44/sales-across-district-lines.htm)
- CDTFA — [District Tax guide for retailers](https://cdtfa.ca.gov/industry/local-and-district-retailer-taxes/district-tax.htm)
  (courtesy collection, liability for what is collected)
- CDTFA — [Wayfair collection requirements](https://cdtfa.ca.gov/industry/wayfair/) ($500,000, operative 25 April 2019, in-state and out-of-state)
- [State-by-state economic nexus thresholds](https://www.avalara.com/us/en/learn/guides/state-by-state-guide-economic-nexus-laws.html)
