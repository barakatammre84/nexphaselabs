---
title: 'How to Read a Certificate of Analysis'
slug: 'how-to-read-a-certificate-of-analysis'
meta_description: 'A section-by-section guide to reading a peptide certificate of analysis: identity versus purity, why HPLC area percent is not weight percent, net peptide content, and the omissions that should stop a purchase.'
category: 'Analytical methods'
author: 'NexPhase Labs'
status: "DRAFT — requires Ammre's approval before publishing"
compliance_note: 'Passes the swap test: every section works unchanged for any compound from any supplier. Contains no statement about what any material does, no dosing, no route, no condition, no study citation.'
schema_type: 'Article'
---

# How to Read a Certificate of Analysis

A certificate of analysis is the only document that tells you what is actually in the vial you are buying. It is also the document most often skimmed, misread, or accepted at face value because it looks official.

This guide walks through a peptide COA section by section — what each line means, which numbers are commonly misunderstood, and what an omission tells you. It applies to any supplier's paperwork, including ours. If a COA cannot survive being read this carefully, that is useful information about the material and about whoever sold it.

---

## What a COA is, and what it is not

A certificate of analysis is a record of measurements performed on **one specific lot** of material. It is not a product description, not a specification sheet, and not a statement about the compound in general.

That distinction matters more than it sounds. A specification says what a product is _supposed_ to be. A certificate says what _this batch measured_. A document that gives you identical numbers for every lot is a specification wearing a certificate's clothing, and it tells you nothing about the vial in your hand.

**The first test:** does the document reference a unique lot or batch number, and do the values change from lot to lot? If not, you are holding marketing material.

---

## The header: who made it, who tested it

A complete COA identifies both the **manufacturer** and the **testing laboratory**, with a physical address for the manufacturer. These are frequently different organisations, and both matter.

A manufacturer's name with no address is a common gap. In California, suppliers are required to be able to identify the manufacturer's name and address for material they distribute — and more practically, a manufacturer you cannot locate is a manufacturer you cannot audit, question, or return to.

Where testing was performed by a third-party laboratory, that laboratory should be named. In-house testing is not automatically inferior, but it is a different thing, and a supplier who obscures which one happened is making a choice about your ability to evaluate them.

---

## Product identification: four fields that must agree

- **Product name** — the chemical name, not a brand or trade name
- **CAS registry number** — the unique identifier for the substance
- **Molecular formula**
- **Molecular weight**

These four must be internally consistent. A formula that does not sum to the stated molecular weight, or a CAS number that belongs to a different substance, is a serious finding — usually clerical, occasionally not.

**Verify the CAS number independently.** It takes thirty seconds in any public chemical database, and it is the single fastest check available to you. A material with no CAS number at all is a specific and important case, covered below.

---

## Lot number and dates

The lot number should be unique, traceable, and structured. Ours encode the product, size, year and month, and a sequence — `GHKCU50-2605-01` reads as GHK-Cu, 50 mg, May 2026, first lot. Any consistent scheme is fine; the point is that the number means something and can be traced back through the supplier's records.

Expect three dates:

- **Date of manufacture**
- **Date of analysis** — when the tests reported here were run
- **Retest or expiry date**

Date of analysis is the one people skip. Purity and water content are properties of the material _at the time it was measured_. A certificate dated three years before the material shipped describes a different sample than the one you received.

---

## Identity and purity are two different questions

This is the most common misreading of a COA, and it is worth being precise about.

**Identity** asks: is this the compound you say it is?
**Purity** asks: how much of what is in this vial is that compound?

A material can pass identity and fail purity, or the reverse. A COA that reports only one of them has answered half the question.

### Identity testing

For a peptide, expect at least one and preferably two of:

- **Mass spectrometry** — confirms the molecular weight of what is present. The observed mass should match the theoretical mass. This is strong evidence of identity and weak evidence of purity: mass spec confirms the target is _there_, not that little else is.
- **HPLC retention time** compared against a reference standard.
- **Amino acid analysis** or **sequencing** — the most rigorous, and correspondingly less common.

A COA reporting mass spec alone has confirmed the compound exists in the vial. It has not told you what proportion of the contents it represents.

### Purity testing

Purity is normally reported as **HPLC area percent** — the peak area of the target compound as a percentage of total peak area in the chromatogram.

Three things must accompany that number for it to mean anything:

- **The method** — column type, mobile phase, gradient
- **The detection wavelength** — commonly 214 nm or 220 nm for peptides
- **The chromatogram itself**, or at least its availability on request

**A purity percentage with no method is not a measurement, it is an assertion.** Two laboratories running different gradients on the same material will report different numbers, both honestly. A shallow gradient resolves closely-eluting impurities that a steep one hides inside the main peak. Detection wavelength matters too: 214 nm sees the peptide bond and therefore most peptide-related impurities, while a higher wavelength may miss species the buyer would want counted.

This is why "99% pure" from two suppliers is not a comparison. Without the method, you are comparing two unlabelled numbers.

---

## The number most buyers never ask for: net peptide content

Here is where most peptide COAs go quiet, and it is the most consequential gap on the page.

**HPLC area percent is a measure of chromatographic purity, not of weight.** It tells you what fraction of the peptide-related material in the sample is your target compound. It does not tell you what fraction of the powder in the vial is peptide at all.

Lyophilised peptides routinely contain, by weight:

- **Water** — typically 5–15% in a lyophilised solid, measured by Karl Fischer titration
- **Counterion salt** — peptides purified by reversed-phase HPLC using trifluoroacetic acid arrive as TFA salts, and the TFA can represent a substantial weight fraction
- **Residual solvents** from synthesis and purification

The consequence: a vial can be entirely honest in reporting 99% HPLC purity while the powder is meaningfully less than 99% peptide by mass. The two numbers answer different questions and both are legitimate — but only one of them tells you how much peptide you weighed out.

**Net peptide content** — determined by amino acid analysis or nitrogen determination — is the figure that resolves this. It is reported far less often than it should be.

So the fuller picture requires four numbers, not one:

1. HPLC purity, with method
2. Water content (Karl Fischer)
3. Counterion identity and content
4. Net peptide content

A supplier who reports all four is telling you they know what is in the vial. A supplier who reports only the first is not necessarily hiding anything — but they have left you unable to calculate what you actually have.

---

## Appearance, solubility, storage

Straightforward, and worth reading rather than skipping.

**Appearance** should describe what you will see: white to off-white lyophilised powder, and so on. If what arrives does not match what the certificate describes, that is a discrepancy to raise before anything else happens to the material.

**Storage conditions** on the certificate are the conditions under which the reported values hold. A material specified for −20 °C that spent a week at ambient temperature is no longer fully described by its certificate. This is also why shipping conditions and cold chain are part of the analytical question, not separate from it.

---

## When there is no CAS number

Some materials genuinely have no CAS registry number — novel compounds, and undisclosed mixtures.

For a mixture sold under an invented alphanumeric name, the absence is structural rather than clerical. A blend with no disclosed composition cannot have a meaningful CAS number, cannot have a single molecular weight, and cannot have a compliant safety data sheet, because the GHS format requires composition disclosure in Section 3.

You do not need to interpret this. You only need to notice that the document cannot be completed, and ask why the product exists in a form that makes completion impossible.

---

## Twelve things that should stop a purchase

Each of these is individually enough to warrant a question. Several together is an answer.

1. No lot or batch number
2. Identical values across different lots
3. No manufacturer name, or a name with no physical address
4. No date of analysis
5. Purity reported with no method, column, gradient or wavelength
6. Identity testing absent, or mass spec presented as if it were a purity measurement
7. "Typical" or "≥" values throughout, rather than measured results for this lot
8. No water content, for a lyophilised solid
9. No counterion or net peptide content disclosed
10. A scanned image with no traceable origin, or an unsigned document
11. A certificate that cannot be matched to the label on the vial
12. A supplier who will not provide the underlying chromatogram on request

That last one is the most telling. Every laboratory that ran the analysis has the chromatogram. A refusal to share it is a choice.

---

## What to do with this

Read the certificate before the material is used, not after something looks wrong. Check the CAS number independently. Confirm the lot on the paperwork matches the lot on the vial. Note which of the four purity-related numbers are present and which are missing, and ask for the missing ones — the response to that request is itself informative.

Certificates for every lot we release are published against the lot number, including the analytical methods used, and are available before purchase rather than after.

---

_NexPhase Labs supplies research materials to institutions and qualified researchers. All products are for research use only — not for human or veterinary use. This article describes analytical documentation and makes no statement regarding the properties, effects, or applications of any material._
