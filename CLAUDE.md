## Owner-directed checkout change — 2026-09-04

The owner explicitly requested removal of buyer registration, email verification, and organization approval gates. `OPEN_CHECKOUT_ENABLED=true` enables guest checkout and public list prices; it is enabled for staging only. This supersedes the institutional-only purchasing restrictions below **for environments where that switch is enabled**. Do not reinstate those buyer gates on the staging purchase path. Optional account registration and staff authentication remain separate. Research-use notices, safe data access, real payment settlement checks, and released-lot/stock controls stay in place. Never invent selling prices or substitute a simulated payment for real payment. Guest contacts are order snapshots, not verified identities.

# NexPhase Labs — working notes for Claude Code

Operating entity: 8486 LLC (California), trading as NexPhase Labs.
Facility: Oakland, CA. Not FDA registered. Pre-launch — nothing has shipped and
no payment has been taken.

## What this is

A catalog site for a research-materials supplier selling to **verified
institutional accounts only**. It is not a consumer storefront and must not
become one.

## Read this before editing product copy

The constraints below are not stylistic. Each one tracks specific language FDA
has quoted as evidence of intended human use in warning letters to peptide
sellers (Summit Research Peptides 12/2024, Prime Peptides 12/2024,
USApeptide.com 2/2025, PureRawz 9/2025, seven letters dated 3/31/2026 including
PekCura Labs and Gram Peptides, Wholesale Peptide 6/2026).

A "Research Use Only" disclaimer has failed in every one of those letters. It is
not a defense, and where it is knowingly false it is affirmative evidence of the
felony aggravator under 21 U.S.C. 333(a)(2). The protection comes from the facts
— who the customers are, what the product physically is, what the site says —
not from the label.

### Never add to this site

- Any disease name near a product, including framed as "research into X"
- Structure/function claims: appetite, satiety, fat oxidation, energy, recovery,
  sleep, muscle, inflammation, healing, repair, cognition
- Human clinical trial outcomes of any kind
- **Human dose or route.** "2.4 mg weekly subcutaneous" is verbatim what FDA
  quoted against PekCura
- Reconstitution instructions or volumes, especially in bacteriostatic water
- Dosage or reconstitution calculators, above all any converting to insulin
  syringe units
- Testimonials, reviews, or before/after imagery mentioning any effect
- FDA-approval references or brand names (Ozempic, Wegovy, Mounjaro, Egrifta)
- Comparison pages framed on benefits or pros/cons
- Stacking, cycling, protocol, or "how to use" content
- Bacteriostatic water, syringes, needles, or injection kits in the catalog —
  including under renamed SKUs
- Invented alphanumeric product names that map to a compound (GLP-1-S, -2T, -3R
  patterns). FDA issued seven letters in one day against exactly this
- A research library, blog, or literature summary that links to an order button.
  **Adjacency is the theory of the case.** If both must exist, keep them apart

### Safe, and encouraged

Chemical identity (IUPAC/peptide name, CAS, sequence, formula, MW, SMILES,
InChI Key, PubChem CID), purity with the analytical method stated, physical
form, salt/counter-ion, solubility **in laboratory solvents** with published
concentrations, storage, stability, shipping condition, pack sizes, lot-level
COA/chromatogram/mass spec, SDS, in vitro pharmacology with a named target and a
measured constant citing primary literature, QC methodology and analytical
capability content.

The line to hold: **solvent solubility is chemistry; a reconstitution volume is
dosing.**

## Structural rules that must survive refactors

1. `REGULATORY_STATEMENT` renders in the **body** of the product page and the
   catalog index, **above the fold**. A footer disclaimer sitting beneath a body
   claim is the exact fact pattern FDA relies on. Do not "tidy" it into the
   footer.
2. Products are classified by **chemical class**, never by indication, research
   area, or physiological process. `ChemicalClass` in `lib/catalog.ts` is the
   only classification axis. "Tissue & repair models" was removed for this
   reason; do not reintroduce that shape.
3. Pricing renders only to verified accounts. A gated catalog also leaves no
   public product page to be read as an offer to the general public.
4. Every value in the catalog is attributable. `sourceNotes` on each product
   records provenance and flags supplier disagreements. **Do not add a value you
   cannot source, and do not silently reconcile conflicting supplier data** —
   show both, as the NAD+ solubility and GHK-Cu formula entries do.
5. Product images are optional (`image?`). Where no photograph exists, the page
   says so. Do not substitute another compound's vial.

## Catalog data notes (verified 2026-09-02)

Sources: PubChem PUG-REST, EPA CompTox, and published Cayman Chemical /
MedChemExpress / MilliporeSigma inserts.

- **NAD+**: use PubChem CID **5892**. CID 925 is stereo-undefined and carries no
  CAS. CAS 606-68-8 appears in "NAD disodium" searches but is **NADH** — the
  reduced form. Suppliers disagree on both solubility (10 vs 100 mg/mL in PBS)
  and hazard classification; both are shown.
- **GHK-Cu**: molecular formula is genuinely unsettled — four values circulate,
  differing by ligand protonation. We use the Cayman/MCE consensus
  (C14H22CuN6O4, 401.91) and say so. No InChI Key is published because the
  structure isn't settled. It is **blue to purple**, not white.
- **BPC-157**: Cayman publishes no solubility data. The array is intentionally
  empty. Suppliers disagree on shipping condition (ambient vs wet ice).
- **Withdrawn, with reasons recorded in a comment block in `lib/catalog.ts`**:
  tesamorelin (active ingredient of an approved biologic, BLA 022505 — carries
  Public Health Service Act exposure the others don't), and the "NexPhase-2T" /
  "NexPhase-3R" blends (undisclosed composition cannot function as a research
  reagent — no CAS, no sequence, nothing citable; a compliant SDS is also
  impossible since Section 3 requires composition disclosure).

## Lot records

The lot is the unit of truth. Schema in `db/schema.ts`.

- `status` defaults to `quarantine`. Material is not sellable until a named
  person releases it, recorded with who and when. **There must be no code path
  that makes a lot available implicitly.**
- Nothing is hard-deleted. Corrections are new rows; `supersededById` points at
  the replacement.
- `manufacturerName` / `manufacturerAddress` are required before release.
  California 16 CCR 1736.9(d) requires a COA to give the name and address of the
  **manufacturer** — a distributor's COA does not satisfy it.
- `lotMovements` is append-only and **never exposed publicly**. The lookup API
  has no access to it.
- Public lot lookup (`app/api/lots/[lotNumber]/route.ts`) resolves **released
  lots only**. A quarantined, held, rejected or withdrawn lot returns 404 rather
  than leaking its existence and status. Keep it that way.

## Competitor findings that shape this build (teardown 2026-09-03)

Source studied: simplepeptide.com — the category's highest-traffic site
(~311.6K visits/mo), operated by **Melex Technologies Inc** (FL P19000056045).

**Copied deliberately:**

- Lot COA archive searchable by **accession number** — the testing lab's own
  reference for the sample. It is what lets a customer verify a certificate
  with the lab rather than trusting us. `lots.accessionNumber`.
- Explicit **testing-standard versioning** — records issued under an earlier
  panel say so, rather than being silently back-filled. `lots.testingStandard`.
- Same-business-day dispatch with a published cut-off.

**Deliberately NOT copied — each is an enforcement trigger:**

- **Oral/sublingual strips, capsules, flavoured products, nebulisers, nasal
  sprays.** 18 of their 96 SKUs are dissolving strips. A flavoured 80 mg strip
  in a pocket tin has no bench use case; dosage form is itself evidence of
  intended human use.
- **Ancillaries**: bacteriostatic water, insulin syringes (31G × 8 mm), mixing
  syringes, vial cases. Bacteriostatic water was a cited product in five of
  FDA's seven 31 Mar 2026 letters.
- **Outcome-named categories**: Sleep, Immunity, Libido, Anti-Aging, Longevity,
  Passion and Performance. Category names are claims.
- **Sterility and endotoxin as headline release specs.** These are
  pharmaceutical specs. There is no bench reason to endotoxin-test a compound
  that will never enter a body — advertising them signals injectable intent.
- **A login wall as compliance theatre.** Their catalog is gated but every
  product URL is publicly indexed with price and Add-to-Cart, and the only
  attestation is static "you confirm you are 21" text with no checkbox and no
  research-use affirmation anywhere in the funnel. Our gate must be real
  verification or it is worth nothing.
- **Unnamed testing lab.** Theirs (Freedom Diagnostics) appears only inside PDF
  metadata. `lots.analyticalLab` is public here — an unnamed lab is an
  unverifiable claim.
- **Suppressed manufacturer attribution.** They print `Manufacturer: Remetide`
  (a China-based synthesiser) on low-risk SKUs and "Source: see lot
  documentation" on GLP-1s, while the homepage claims "U.S.-manufactured."
  `manufacturerName`/`manufacturerAddress` are required before release here,
  which is also what CA 16 CCR 1736.9(d) demands.

**The risk vector that changed in August 2026:** on 12 Aug 2026 Eli Lilly filed
six suits against RUO peptide sellers over retatrutide. They did **not** plead
patents — they pleaded **state consumer-protection statutes**, alleging the RUO
designation was itself deceptive. That theory needs no patent, and it starts
from a **test purchase**, so a login wall provides no protection against it.
Assume any public claim on this site can be read by a plaintiff who bought a
vial.

## Stack

Next.js 15 (async route params) / React 19 / TypeScript 5.9, Tailwind, lucide
icons. Deployed on Cloudflare Workers via `vinext`; D1 + Drizzle (sqlite-core)
for data. `getDb()` in `db/index.ts` throws when the D1 binding is absent — the
lookup route handles that as a 503.

```
npm run dev          # vinext dev
npm run build        # vinext build
npm run lint         # oxlint
npm run format       # oxfmt
npm run db:generate  # drizzle-kit generate
```

`npx tsc --noEmit` is the fastest correctness check.

## Current state

Uncommitted work in the tree: catalog rebuilt on the chemical-identity schema,
product pages rebuilt, classification changed from indication to chemical class,
lot lookup added (page, component, API route, schema). Typecheck passes.

`.bak-archive/` holds prior versions of `lib/catalog.ts` and the product page,
plus the withdrawn product images. Safe to delete once the diff has been
reviewed.

## Open items

- Harden the access gate from self-attestation to real institutional
  verification. Every high-traffic competitor uses a checkbox; actual
  verification is what makes the positioning substantive rather than decorative,
  and it is what a regulator, an insurer and an acquiring bank each ask to see.
- No entity name, state of incorporation, or founding year on `/about` — the
  TODO there is still open.
- OSHA hazard communication program, GHS labels and SDS library are due
  **20 November 2026**.
- SDS files are referenced but not yet stored; `hasSds` is currently a flag.
- Regulatory counsel has not yet been engaged. Nothing here is legal advice, and
  the product list in particular should be confirmed with an FDA regulatory
  attorney before launch.
