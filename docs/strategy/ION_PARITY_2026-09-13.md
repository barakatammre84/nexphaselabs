# ionpeptide.com — what was copied, and what was not

Reviewed 13 September 2026 by browsing the live site (ionpeptides.com redirects to ionpeptide.com).
Written in the same shape as the simplepeptide.com teardown in `CLAUDE.md`, because the conclusion is
the same: the parts worth copying are commercial, and the parts that carry the exposure are the
catalog and the naming.

## How close the two already are

This is not a resemblance, it is a lineage. The design tokens in `app/globals.css` are named after
them — `--ion-blue`, `--ion-navy`, `--ion-ink`, `.ion-hero`, `.ion-kicker`, `.ion-panel`,
`.ion-trust-strip` — with 376 uses across the app, and one line of copy is word for word: their
homepage and ours both say *"Research products ready to explore"*
([app/page.tsx](../../app/page.tsx), [app/catalog/page.tsx](../../app/catalog/page.tsx)).

| | ionpeptide.com | NexPhase |
|---|---|---|
| Trust strip | Verified COAs · Batch Tested · 24/7 Support · Same-Day Ship | Lot-specific COAs · Purity reported by batch · Real human support · Traceable fulfilment |
| Hero | "100+ RUO Peptides Available" | "Research peptides. Verified by lot." |
| Product page | Pack sizes, volume pricing, add to cart, COA link | The same, plus full chemical identity |
| COA access | Library, searchable by product and batch | Lookup by lot **and accession number**, plus a library by product |
| Attestation | Static "you confirm you are 21 or older and qualified researcher" | Stored per order: versions, wording hash, time, address, research setting |

## Copied deliberately, 13 September

- **Volume pricing.** Their product page prices 4–5, 6–9 and 10+ at decreasing unit prices with an
  "add 3 more units to save" nudge. Ours now does the same — with the ladder entered by an owner in
  the catalog manager, never invented by code, and re-derived server-side in the order guard so a
  cart cannot present a discount the catalog does not carry (`lib/price-breaks.ts`).
- **A browsable certificate library.** Theirs lists certificates by product; ours now does too, with
  the testing laboratory and its accession number on every row, composed from the same publication
  rule as the public lookup so nothing quarantined, held, rejected, withdrawn, superseded or missing
  its laboratory reference can appear (`lib/lots-public.ts`, `releasedLotsByProduct`).
- **A visible way to reach a person.** Theirs is a live-chat bubble promising a reply "within
  minutes"; a three-person company cannot keep that. Ours states the commitment we can keep, from
  the same constants the queue's ageing alerts read, and states the boundary in the same breath
  (`components/site/support-strip.tsx`).
- **Saved addresses and a one-step repeat purchase.** Friction they do not have and we did.

## Deliberately not copied

Their catalog is, almost line for line, the list `CLAUDE.md` was written against:

- **Dosage forms.** Oral drops ("Drops – ION-3R | 18mg", "Drops – Glow Stack"), nasal and oral
  sprays, creams, serums, shampoo, conditioner, body lotion, sheet masks, a tallow balm.
- **Ancillaries.** Bacteriostatic water (**BW**, their fourth featured product), phosphate-buffered
  saline, acetic acid 0.6%.
- **Blends and named stacks.** BPC-157+TB500+KPV, "GLOW", "KLOW", "Wolverine Stack", "REM Blend",
  "Lipo-C Burn Blend".
- **A static age attestation** with no checkbox and no research-use affirmation in the funnel.
- **No chemical identity at all.** Their product page carries no CAS, no sequence, no formula, no
  molecular weight, no purity specification — only a pack size and a price. Publishing all of it is
  our actual differentiator, and it is the opposite of their approach rather than a version of it.

## The one thing that needs a decision

Their GLP-1s are **ION-1S, ION-2T, ION-3R**. Ours are **NP-2T** and **NP-3R**, alongside **BW**.

Same convention, and per the parent register's finding F-02 the same three products FDA cited in the
Gram Peptides warning letter of 31 March 2026 — retatrutide and tirzepatide under alphanumeric
codenames, plus bacteriostatic water.

Nothing in this pass changed a product, a name or a price: products are data managed through the
catalog manager, and the product-set question is recorded as chapter 12 of the launch register for
the members and counsel. It is noted here only so that "make it feel like ionpeptides" is never read
as including the catalog.
