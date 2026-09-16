# COA intake and catalog-rules review — 15 Sep 2026

Source: the inventory sheet of 15 Sep 2026 and the four ILS Laboratories
certificates linked from its COA column. Every value below was read out of the
PDFs, not from the sheet.

## 1. What the certificates say

All four were issued by **ILS Laboratories, 8222 Vickers St, Suite 106, San
Diego, CA 92111, (619) 329-3999**, ISO/IEC 17025 accredited, signed by
**Dr. Greg Kalyuzhny, Lab Director**. All four received 01 Jul 2026.

| Field | GHK-Cu 50 mg | NP-3R 10 mg | NP-3R 30 mg | Sterile soln. 0.9% benzyl alcohol 10 mL |
|---|---|---|---|---|
| COA number | COA-2026-ZKMVY2 | COA-2026-OH42ST | COA-2026-FU_PJB | COA-2026-CSGJ-S |
| **Lot on the certificate** | GHKCU50-2605-01 | NP3R10-2605-01 | NP3R30-2605-01 | **N/A** |
| **Accession number** | ACC-2026-7333 | **absent** | **absent** | ACC-2026-7334 |
| Analysis date | 21 Jul 2026 | 14 Jul 2026 | 14 Jul 2026 | 21 Jul 2026 |
| Identity (HPLC-RTM) | GHK-Cu, confirmed | Retatrutide, confirmed | Retatrutide, confirmed | Benzyl alcohol, confirmed |
| Purity (RP-HPLC, 214 nm) | 99.80% vs ≥95.0% | 99.23% vs ≥95.0% | 99.96% vs ≥95.0% | 0.845% vs 0.8–1.0% |
| Net peptide content | 51.17 mg | 10.58 mg | 31.81 mg | — |
| Endotoxin, USP <85> | 0.25 EU/mL | 0.11 EU/mL | 0.072 EU/mL | 0.072 EU/mL |
| Sterility, PCR | No growth | No growth | No growth | No growth |
| Heavy metals, ICP-MS | **panel absent** | As/Cd/Cr/Hg/Pb all ND | As/Cd/Cr/Hg/Pb all ND | As/Cd/Cr/Hg/Pb all ND |
| Fentanyl screen | Not detected | Not detected | Not detected | — |
| Verification | Access code 4TAYNVTL | DABHQL2T | JW7B6AQQ | Z2CDKDHR, portal.ils-lab.com/verify |

**Testing standard to record on each lot** (`testingStandard`):

> ILS Laboratories Full QC Panel — identity by HPLC retention-time comparison
> against a reference standard; purity by RP-HPLC area normalisation at 214 nm;
> elemental impurities by ICP-MS per USP <233>; endotoxin per USP <85> kinetic
> turbidimetric; sterility by PCR. Laboratory ISO/IEC 17025 accredited.

Omit the ICP-MS clause for GHK-Cu, whose certificate carries no such panel.

## 2. What blocks each lot, in the order the code checks it

### Blocks release — all four lots

`releaseBlockers()` requires a manufacturer name **and** address under
16 CCR 1736.9(d). **No certificate names a manufacturer.** ILS is the testing
laboratory; it is not who made the material. Until the manufacturer's name and
street address are recorded at intake, not one of these lots can be released —
GHK-Cu included. This is the single blocker standing between the site and its
first sale, and it cannot be cleared from code.

### Blocks publication — both NP-3R lots

`publicationBlockers()` requires the laboratory's own accession number, because
that is what lets a customer verify the certificate with ILS rather than take
our word for it. The GHK-Cu and benzyl-alcohol certificates carry one; **both
NP-3R certificates do not.** ILS would need to reissue them, or supply the
accession numbers in writing.

### Blocks publication — NP-2T and NP-3R

Both are on counsel hold. See §3.

### Blocks the benzyl-alcohol lot outright

Its certificate records **Lot Number: N/A**. A certificate that names no lot
cannot substantiate lot NPBW10-2605-01; it substantiates nothing traceable.
Ask ILS to reissue against the lot number.

Two further problems with that line:

1. The certificate reports the benzyl-alcohol assay in a row headed **"Peptide
   Purity (HPLC)"**, result 0.845%. Entered as a lot's purity result it would
   publish "Purity 0.845%" on a public lot page. That is the specified benzyl
   alcohol concentration, not a purity, and must not be recorded as one.
2. The catalog cannot currently hold this product at all — see §4.

### Not a blocker, but worth raising with ILS

GHK-Cu is the one line that is otherwise clean, and its certificate is the
thinnest of the four: no ICP-MS panel, so no elemental-impurity screen and no
copper figure. For a copper-peptide complex the copper stoichiometry is the
number a buyer most wants. The other three lots got the panel for the same
$500 fee.

## 3. Counsel hold — code change made today

`COUNSEL_HOLD` already listed tirzepatide and retatrutide by compound name.
But `counselHold()` reads only `name`, `formalName` and `synonyms`, and the
inventory sheet sells these under house codes in its "Website Name" column:
**NP-2T** and **NP-3R**. A product created as "NP-3R" with no formal name and
no synonym walked past every rule in the list. A hold that a naming choice can
switch off is not a hold.

Both codes are now held in their own right, with reasons that name the
compound. Word-boundary anchoring keeps NPL-004 and NP-3RX out. `counselHold()`
had no test coverage at all; it now has some, including the compounds this
catalog does sell, which must keep returning null.

**What was not changed:** retatrutide's hold itself. It is the only thing
blocking two lots that now demonstrably have passing certificates, and its
stated reason is substantive — FDA warning letters of 31 Mar 2026 and the Eli
Lilly consumer-protection suits of 12 Aug 2026. The code already has the right
release valve: `publicationHold()` permits publication once the
**"Regulatory counsel review recorded"** operational control is set to Ready.
Clearing that control is a recorded legal decision with a named person against
it. Deleting the line from the source file is the same decision with nobody's
name on it. The first is the mechanism; the second should not happen.

## 4. The catalog cannot represent bacteriostatic water

Three separate rules stop it, and they were all put there on purpose:

1. `FORBIDDEN` treats `/bacteriostatic/` as a **reconstitution instruction**,
   and product `name` is scanned. A product named "Bacteriostatic Water" is
   rejected by its own name.
2. `FORBIDDEN_SOLVENT` excludes bacteriostatic water, sterile water for
   injection and saline from the accepted solvent list.
3. `PRESENTATIONS` offers no aqueous-solution option — the only solution
   presentation is "Solution in DMSO, sealed vial".

This is not an oversight to patch. Diluent sold beside research peptides is
precisely the pattern FDA warning letters cite as evidence of intended human
use: it is the item that turns a set of reagents into a kit. Loosening these
three rules to stock a $21 line would weaken the argument protecting the whole
catalog. **Recommendation: do not list it.** If it is to be listed anyway, that
is a counsel question, and it should be decided before code moves, not after.

## 5. Catalog versus inventory

Live production catalog, all five published and marked available or limited:

| Code | Product | Lots | Stock |
|---|---|---|---|
| NPL-001 | BPC-157 | 0 | none |
| NPL-002 | beta-NAD+ | 0 | none |
| NPL-003 | GHK | 0 | none |
| NPL-004 | GHK-Cu | 0 | 47 vials on the sheet |
| NPL-005 | Selank | 0 | none |

Only **one** published product corresponds to anything actually in inventory,
and four are advertised as available with no stock, no lot and no certificate
behind them. The inventory sheet's other lines — tirzepatide, retatrutide,
bacteriostatic water — have no catalog product at all. Either the four empty
products come down to draft or they get lots; leaving them published as
"available" misrepresents the catalog.

## 6. Inventory discrepancy to resolve

Every line shows exactly 3 units consumed except **NP-3R 30 mg: 30 purchased,
20 on hand — 10 unaccounted for.** The movement ledger is append-only and
models 21 CFR 1304.21; it needs a recorded disposition for those 10, not a
silent adjustment.

Separately, NP-2T carries a $500 testing fee on both sizes with COA "Na". Worth
establishing whether testing was paid for and never delivered.

## 7. Shortest path to a first sale

1. Record the **manufacturer name and street address** for the GHK-Cu lot.
   Nothing else on this list matters until this exists.
2. Intake lot GHKCU50-2605-01 against NPL-004: 47 vials, container size 50 mg,
   received 01 Jul 2026.
3. Upload COA-2026-ZKMVY2; record analytical lab ILS Laboratories, accession
   ACC-2026-7333, the testing standard above, net peptide content 51.17 mg.
4. Record the identity test (HPLC-RTM, GHK-Cu, confirmed, pass) and the purity
   test (RP-HPLC 214 nm, 99.80%, spec ≥95.0%, pass).
5. Release the lot, then publish it.
6. Set the other four published products to draft until they have lots.

That makes GHK-Cu purchasable: 47 vials at $29 is $1,363 of sellable stock —
against roughly $8,200 of catalog value, the rest of which sits behind the
counsel hold and the missing certificates.
