/**
 * The laboratory guide library (owner, 16 Sep 2026).
 *
 * CLAUDE.md forbids a research library that sits beside an order button, because adjacency is
 * the theory of the case in every warning letter this business is written against. These guides
 * are therefore about chemistry, analytics and handling only, and they are kept structurally
 * apart: nothing here names a product, and no page in this section links to the catalog or to a
 * cart. Cross-links go to the lot lookup and the safety data sheets, which are records rather
 * than offers.
 *
 * The line each guide holds: solvent solubility is chemistry, a reconstitution volume is dosing.
 */

export type GuideSection = {
  heading: string;
  paragraphs: string[];
  /** Optional bullets, rendered after the paragraphs. */
  list?: string[];
};

export type Guide = {
  slug: string;
  title: string;
  /** One sentence for the index card and the meta description. */
  summary: string;
  minutes: number;
  sections: GuideSection[];
};

export const GUIDES: Guide[] = [
  {
    slug: 'reading-a-certificate-of-analysis',
    title: 'How to read a certificate of analysis',
    summary:
      'What each field on a certificate means, which ones are worth checking, and how to verify a certificate with the laboratory that issued it rather than with the seller.',
    minutes: 6,
    sections: [
      {
        heading: 'A certificate describes a lot, not a product',
        paragraphs: [
          'A certificate of analysis reports what was measured on one specific production run. It is not a specification for a product line, and it is not a promise about the next run. If a supplier shows you a single certificate for a material rather than one per lot, the document is telling you less than it appears to.',
          'The lot number is therefore the first thing to check. It should appear on the vial label, on the certificate, and on the paperwork in the parcel, and all three should agree exactly. A certificate that does not carry the number printed on the vial in front of you cannot be reconciled with that vial.',
        ],
      },
      {
        heading: 'The fields that carry the weight',
        paragraphs: [
          'Most of a certificate is administrative. A small number of fields tell you whether the testing actually happened and whether it was independent.',
        ],
        list: [
          'The name of the testing laboratory. An unnamed lab is an unverifiable claim, and a certificate without one cannot be checked by anybody except the seller who printed it.',
          "The laboratory's own reference for the sample, often called an accession number. This is what lets you contact the laboratory and ask whether the report is theirs.",
          'The method beside each result. A purity figure without a method is a number, not a measurement.',
          'The date of analysis and any retest date, which together tell you how old the result is.',
          'Who released the lot, and when. A release is a decision made by a person, and the record should say which person.',
        ],
      },
      {
        heading: 'Checking it with the laboratory',
        paragraphs: [
          'The point of publishing the testing laboratory and its accession number is that you do not have to trust the seller. You can contact the laboratory directly, quote the accession number, and ask whether they issued a report against it and whether the results match what you are holding.',
          'Very few suppliers in this category make that possible. Where a certificate names no laboratory, or where the laboratory appears only inside the file metadata rather than on the face of the document, treat the result as a claim rather than a measurement.',
        ],
      },
      {
        heading: 'When the paperwork and the vial disagree',
        paragraphs: [
          'Stop, and do not use the material. A mismatch between a label and a certificate is a quality event, not an administrative slip, and it should put the lot on hold while it is investigated. Photograph the vial, the label and the paperwork before anything else, because the record of what arrived is easier to establish on the day than a week later.',
        ],
      },
    ],
  },
  {
    slug: 'how-purity-is-measured',
    title: 'How purity is measured, and what the number does not tell you',
    summary:
      'What an HPLC area-percent purity result actually reports, why a single site-wide purity figure is meaningless, and the questions a purity number leaves open.',
    minutes: 6,
    sections: [
      {
        heading: 'Area percent, not mass percent',
        paragraphs: [
          'Purity on a peptide certificate is almost always measured by reversed-phase high-performance liquid chromatography, and it is almost always reported as area percent. The sample is separated on a column, a detector records absorbance as each component leaves it, and the area under the main peak is divided by the total area under all peaks.',
          'That is a statement about the proportion of detected material, not about the proportion of the mass in the vial. Anything the detector does not see does not appear in the denominator. Residual water, counter-ions and inorganic salts are typically invisible at the wavelength used, so a vial can be correctly reported at high area-percent purity and still contain a meaningful fraction of material that is not the peptide.',
        ],
      },
      {
        heading: 'What the wavelength decides',
        paragraphs: [
          'Peptide HPLC is commonly run at 214 nanometres, where the peptide bond itself absorbs, or at 220 nanometres. A detection wavelength chosen higher up, at 254 nanometres for instance, responds mainly to aromatic side chains and can miss impurities that lack them. The wavelength is part of the method, which is why the method belongs beside the result.',
          'Two certificates reporting the same figure under different methods are not reporting the same thing. When comparing suppliers, compare the methods first and the numbers second.',
        ],
      },
      {
        heading: 'Why one figure for a whole catalog is a red flag',
        paragraphs: [
          'Purity is a property of a production run. Runs differ, and an honest supplier publishes the figure that was measured for the lot you are being sold. A site-wide claim that every product exceeds some threshold is a marketing statement rather than an analytical one, and it cannot be reconciled with any individual certificate.',
          'The useful question is not what number a seller advertises. It is whether the number on the certificate for your lot was produced by a named laboratory using a stated method, and whether you can check it.',
        ],
      },
      {
        heading: 'What purity does not establish',
        paragraphs: [
          'A purity result says nothing about identity. A sample can be a very pure something else. Identity is established separately, by mass spectrometry, and a certificate that reports purity without an identity confirmation is only half a document.',
        ],
      },
    ],
  },
  {
    slug: 'identity-by-mass-spectrometry',
    title: 'Confirming identity by mass spectrometry',
    summary:
      'Why a purity figure is not an identity check, how observed mass is compared with calculated mass, and what monoisotopic and average mass mean on a certificate.',
    minutes: 5,
    sections: [
      {
        heading: 'Identity and purity answer different questions',
        paragraphs: [
          'Chromatography tells you how much of the detected material is one component. It does not tell you which component. Identity is confirmed by measuring the mass of the molecule and comparing it against the mass calculated from the intended sequence or formula.',
          'On a peptide certificate this is normally electrospray ionisation mass spectrometry. The instrument reports one or more charged species, and the neutral mass is calculated back from them. The certificate should show the observed value and the expected value side by side.',
        ],
      },
      {
        heading: 'Monoisotopic and average mass',
        paragraphs: [
          'Two different numbers can legitimately be called the molecular weight, and confusing them produces apparent mismatches that are not real.',
          'The monoisotopic mass is calculated using the single most abundant isotope of each element. The average mass is calculated using the average atomic weights, weighted by natural isotopic abundance. For a small peptide the two differ by well under a unit; for a larger one they can differ by several. A certificate should make clear which it is reporting, and the comparison should be like for like.',
        ],
      },
      {
        heading: 'Reading the charge states',
        paragraphs: [
          'Electrospray produces multiply charged ions, so a peptide of mass around 1200 may appear as a singly charged species near 1201 and a doubly charged species near 601. Seeing a consistent series that all calculate back to the same neutral mass is stronger evidence than a single peak, because it is much harder to produce by coincidence.',
          'Small, expected differences also have chemical explanations. Sodium and potassium adducts shift the observed mass upward by predictable amounts, and oxidation of a susceptible residue adds around sixteen units. A good report accounts for what it sees rather than reporting only the peak that matched.',
        ],
      },
      {
        heading: 'What to ask for',
        paragraphs: [
          'The chromatogram and the mass spectrum themselves, not a summary of them. A number transcribed into a table can be typed; a trace with axes, a retention time and a baseline is much harder to invent and much easier for a reviewer to assess.',
        ],
      },
    ],
  },
  {
    slug: 'solubility-in-laboratory-solvents',
    title: 'Solubility in laboratory solvents',
    summary:
      'How published solubility figures are determined, why they vary between suppliers, and the difference between solvent chemistry and preparation instructions.',
    minutes: 5,
    sections: [
      {
        heading: 'What a published solubility figure is',
        paragraphs: [
          'A solubility entry states that a given quantity of material dissolved in a given volume of a named solvent under stated conditions. Common laboratory solvents for peptide work are water, dimethyl sulfoxide, dilute acetic acid and phosphate-buffered saline. The figure is a chemical property measured under particular conditions, not a recipe.',
          'Conditions matter more than they appear to. Temperature, ionic strength, pH and how long the sample was agitated all move the result, which is why two suppliers can publish genuinely different figures for the same compound without either being wrong.',
        ],
      },
      {
        heading: 'Why suppliers disagree, and what to do about it',
        paragraphs: [
          'Where published figures conflict, the honest response is to show both and name the sources rather than to quietly pick one. A reader who can see that two reputable sources disagree is better informed than one who is shown a single confident number with no provenance.',
          'For your own work, treat any published figure as a starting point to be confirmed on the bench under your own conditions.',
        ],
      },
      {
        heading: 'The line this library holds',
        paragraphs: [
          'Solvent solubility is chemistry. A reconstitution volume intended to produce a particular concentration for administration is dosing, and it is not something a research-materials supplier should publish, calculate or advise on.',
          'That distinction is why you will find solubility data here and will not find preparation instructions, reconstitution calculators, or any conversion into syringe units. If a supplier offers you the second kind of content, note what that tells you about who they expect their customers to be.',
        ],
      },
    ],
  },
  {
    slug: 'storage-stability-and-retest-dates',
    title: 'Storage, stability and retest dates',
    summary:
      'Why lyophilized solids are stored cold and dry, what a retest date means as distinct from an expiry date, and how to handle a vial on arrival.',
    minutes: 5,
    sections: [
      {
        heading: 'Why material is supplied lyophilized',
        paragraphs: [
          'Freeze-drying removes the water that most degradation pathways need. A dry solid held cold and sealed is far more stable than the same material in solution, which is why research peptides are shipped as a lyophilized cake or powder rather than ready to use.',
          'The appearance of that cake varies legitimately between runs. It can be a compact disc, a loose fluffy mass, a thin film on the glass, or apparently absent at small fill weights, where a few milligrams spread over the bottom of a vial is genuinely hard to see. Appearance is recorded on the certificate as an observation; it is not by itself a quality signal.',
        ],
      },
      {
        heading: 'Cold, dark and dry',
        paragraphs: [
          'Most lyophilized peptides are held at minus twenty degrees Celsius, protected from light and from moisture. The specific condition belongs to the material and is stated on its own catalog entry and on the sheet packed with the lot; general guidance never overrides the material-specific figure.',
          'Moisture is the one most often underestimated. A vial taken straight from a freezer and opened immediately will condense water out of the room air onto cold glass and cold solid. Letting a sealed vial reach room temperature before breaking the seal costs a few minutes and avoids introducing the very thing the lyophilization removed.',
        ],
      },
      {
        heading: 'Retest is not expiry',
        paragraphs: [
          'An expiry date asserts that a product should not be used after it. A retest date says something narrower and more honest: that the supporting analytical data was generated before that point, and that beyond it the material should be re-analysed rather than assumed.',
          'Research materials generally carry retest dates. A vial past its retest date has not become unusable; it has become undocumented, and the remedy is analysis rather than disposal.',
        ],
      },
      {
        heading: 'On arrival',
        paragraphs: [
          'Inspect the vial and its seal, check the lot number against the certificate, record receipt, and move the material to its stated storage condition. If a temperature-controlled shipment arrives warm, or the coolant is fully thawed and the parcel is warm to the touch, photograph it before unpacking further and raise it the same day.',
        ],
      },
    ],
  },
  {
    slug: 'lot-numbers-and-traceability',
    title: 'Lot numbers, accession numbers and traceability',
    summary:
      'What a lot is, how a lot number differs from a laboratory accession number, and what a traceable supply chain actually lets you reconstruct.',
    minutes: 5,
    sections: [
      {
        heading: 'A lot is the unit of truth',
        paragraphs: [
          'A lot is one production run, handled and tested as a unit. Everything that can be said truthfully about material in a vial is really a statement about its lot: the purity that was measured, the identity that was confirmed, the date it was analysed and the person who released it.',
          'This is why a supplier who reports at product level rather than lot level is telling you less than the format suggests, however confident the number looks.',
        ],
      },
      {
        heading: 'Three different numbers',
        paragraphs: [
          'These are routinely confused, and they answer different questions.',
        ],
        list: [
          "The catalog or product code identifies the material, and is the same for every lot of it.",
          'The lot number identifies one production run. It is the number on the vial, and the one to quote in any question about what you received.',
          "The accession number is the testing laboratory's own reference for the sample they analysed. It is how you verify a certificate with the laboratory rather than with the seller.",
        ],
      },
      {
        heading: 'What traceability should let you reconstruct',
        paragraphs: [
          'At minimum: which lot a given order shipped from, what that lot was tested for and by whom, the manufacturer of the material and their address, and who released it for sale and on what date.',
          'The manufacturer detail matters more than it is usually given credit for. Californian regulation requires a certificate to state the name and address of the manufacturer, and a distributor naming only themselves does not satisfy it. A supplier who cannot tell you who made the material is telling you something about how far their own records go.',
        ],
      },
      {
        heading: 'Keeping your own record',
        paragraphs: [
          'Keep the certificate with the lot, and record the lot number against any work that used it. Where material is later withdrawn or a certificate is reissued, the lot number is the only thing that connects the notice to the vial on your shelf.',
        ],
      },
    ],
  },
  {
    slug: 'peptides-and-proteins',
    title: 'Peptides and proteins: the basic chemistry',
    summary:
      'Amino acids, the peptide bond, how chain length divides the nomenclature, and the conventions used to write a sequence down.',
    minutes: 5,
    sections: [
      {
        heading: 'Amino acids and the peptide bond',
        paragraphs: [
          'A peptide is a chain of amino acids joined by amide linkages known as peptide bonds. The bond forms between the carboxyl group of one residue and the amino group of the next, releasing a molecule of water. Because water is lost at each junction, the mass of a chain is always less than the sum of its free amino acids.',
          'The bond has partial double-bond character, which makes it planar and rigid. That rigidity is why peptide chains adopt reproducible local structures rather than behaving as freely jointed strings.',
        ],
      },
      {
        heading: 'Where the names divide',
        paragraphs: [
          'The vocabulary is conventional rather than sharply defined, and the boundaries are approximate.',
        ],
        list: [
          'Dipeptide and tripeptide: two and three residues.',
          'Oligopeptide: a short chain, conventionally fewer than about ten residues.',
          'Polypeptide: a longer chain, from roughly ten residues upward.',
          'Protein: conventionally longer than about fifty residues, usually with defined folded structure.',
        ],
      },
      {
        heading: 'Reading a sequence',
        paragraphs: [
          'Sequences are written from the N-terminus to the C-terminus, using either single-letter or three-letter codes. Modifications are noted explicitly: an acetylated N-terminus, an amidated C-terminus, or a disulfide bridge between two cysteine residues all change both the mass and the behaviour of the molecule, and all should appear in the identity data.',
          'Counter-ions are part of what is in the vial without being part of the sequence. Synthetic peptides are commonly isolated as acetate or trifluoroacetate salts, and the salt form affects both the mass and the fraction of the vial contents that is peptide. It belongs on the specification.',
        ],
      },
      {
        heading: 'How synthetic peptides are made',
        paragraphs: [
          'Most research peptides are produced by solid-phase synthesis, in which the chain is assembled one residue at a time on an insoluble resin and cleaved at the end. Each coupling step is efficient but not perfect, so the crude product contains deletion sequences differing from the target by one or more residues. Purification, usually by preparative chromatography, is what removes them, and the analytical work described elsewhere in this library is what demonstrates that it worked.',
        ],
      },
    ],
  },
];

export function guideBySlug(slug: string): Guide | null {
  return GUIDES.find((guide) => guide.slug === slug) ?? null;
}

/** Up to `limit` other guides, for the foot of a guide page. Never a product. */
export function relatedGuides(slug: string, limit = 3): Guide[] {
  const index = GUIDES.findIndex((guide) => guide.slug === slug);
  if (index === -1) return GUIDES.slice(0, limit);
  return [...GUIDES.slice(index + 1), ...GUIDES.slice(0, index)].slice(0, limit);
}
