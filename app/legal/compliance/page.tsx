import type { Metadata } from 'next';
import Link from 'next/link';
import { LegalPage, LegalSection } from '@/components/site/legal-layout';
import { REGULATORY_STATEMENT } from '@/lib/catalog';
import { ENTITY } from '@/lib/entity';
import { DISCLOSURE_WORKFLOW, MINIMUM_AGE, RESEARCH_USE_POLICY_VERSION, RUO_VERSION, TERMS_VERSION } from '@/lib/policy';
import { SUPPORT } from '@/lib/support';

export const metadata: Metadata = {
  title: 'Compliance & disclosures',
  description:
    'Who NexPhase Labs is, how its materials are classified, tested and labeled, and where each research-use disclosure is made and recorded.',
};

export default function CompliancePage() {
  return (
    <LegalPage
      title="Compliance & disclosures"
      updated={`Terms ${TERMS_VERSION} · Acknowledgement ${RUO_VERSION} · Research-use policy ${RESEARCH_USE_POLICY_VERSION}`}
      intro="This page is the plain account of how the business is run: who is selling, what is being sold, how it is tested, and where a buyer is told — and asked to confirm — that it is for laboratory research only."
    >
      <LegalSection id="entity" heading="1. Who is selling">
        <p>
          {ENTITY.tradingName} is the trading name of {ENTITY.legalName}, a {ENTITY.jurisdiction} limited liability
          company based in {ENTITY.city}, {ENTITY.region}. The company is owned and run by its members, with no
          outside investors. Every document we issue — certificate of analysis, invoice, packing slip — names the
          issuing entity.
        </p>
      </LegalSection>

      <LegalSection id="classification" heading="2. What is being sold">
        <p>
          We sell research chemicals — synthetic peptides and related materials — for in vitro laboratory use. They
          are not drugs, biologics, dietary supplements, cosmetics, food or medical devices, and they are not
          approved by the Food and Drug Administration or any other regulator for any use. We make no claim that any
          material diagnoses, treats, cures or prevents any condition, and we do not describe effects in people or
          animals anywhere on this site.
        </p>
        <p className="border-l-2 border-primary bg-secondary px-4 py-3 font-semibold text-foreground">
          {REGULATORY_STATEMENT}
        </p>
      </LegalSection>

      <LegalSection id="testing" heading="3. How material is tested and released">
        <p>
          Every lot is tested by an independent analytical laboratory before it can be sold. A lot is released only
          when its certificate of analysis is on file, the identity test has passed, the purity result has been
          reviewed, and the manufacturer&rsquo;s name and address are recorded for the lot. A lot without a named
          laboratory, an accession number and a stated testing standard is not shown to the public, cannot be
          reserved and cannot be shipped. The certificate for any lot we have sold can be found with the lot number
          on the{' '}
          <Link href="/documentation/lot-lookup" className="font-semibold text-primary">
            lot lookup
          </Link>{' '}
          page, and the copy that shipped with an order is pinned to that order with a checksum so it cannot be
          quietly replaced later.
        </p>
      </LegalSection>

      <LegalSection id="labeling" heading="4. Labeling and packaging">
        <p>
          The packing slip carries the research-use statement and lists the lot number for every line, and the
          certificate of analysis for each lot travels in the parcel. Container labels show the material name, lot
          number and quantity so that each vial can be matched to its certificate. Nothing on the label, the packing
          slip or the certificate is guidance for use.
        </p>
      </LegalSection>

      <LegalSection id="disclosures" heading="5. Where the disclosures are made">
        <p>
          A buyer meets the research-use boundary at every step, and the steps that matter are recorded. Age is
          confirmed as at least {MINIMUM_AGE}; the acknowledgement wording is versioned so that we can show exactly
          what was confirmed and when.
        </p>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="py-2 pr-4 font-semibold text-foreground">Step</th>
                <th className="py-2 pr-4 font-semibold text-foreground">What is shown or asked</th>
                <th className="py-2 font-semibold text-foreground">What is recorded</th>
              </tr>
            </thead>
            <tbody>
              {DISCLOSURE_WORKFLOW.map((row) => (
                <tr key={row.step} className="border-b border-border align-top">
                  <td className="py-3 pr-4 font-semibold text-foreground">{row.step}</td>
                  <td className="py-3 pr-4">{row.disclosure}</td>
                  <td className="py-3">{row.recorded}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </LegalSection>

      <LegalSection id="not-published" heading="6. What we do not publish">
        <p>
          No dosing, reconstitution or administration instructions. No testimonials, reviews or customer accounts.
          No condition or disease names attached to a material. No comparisons with medicines or brand names. No
          &ldquo;stacks&rdquo;, protocols or cycles. These rules apply to the site, to our emails and to any social
          account carrying our name, and a page that breaks one is taken down, not edited around.
        </p>
      </LegalSection>

      <LegalSection id="concerns" heading="7. Raising a concern">
        <p>
          A quality concern about a lot, a labeling error, a suspected misuse of our material, or a page on this
          site that you believe crosses the line: write to{' '}
          <span className="font-semibold text-foreground">{SUPPORT.email}</span> with the lot or order number where
          there is one. Quality concerns put the lot on hold while they are checked.
        </p>
      </LegalSection>
    </LegalPage>
  );
}
