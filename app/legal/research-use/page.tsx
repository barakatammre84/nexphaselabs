import type { Metadata } from 'next';
import Link from 'next/link';
import { LegalPage, LegalSection } from '@/components/site/legal-layout';
import { AGE_STATEMENT, MINIMUM_AGE, RESEARCH_USE_POLICY_VERSION, RUO_ACKNOWLEDGEMENT, RUO_VERSION } from '@/lib/policy';
import { SUPPORT } from '@/lib/support';

export const metadata: Metadata = {
  title: 'Research-use policy',
  description:
    'Who may buy from NexPhase Labs, what research use means, what we will not discuss, and how misuse is refused.',
};

export default function ResearchUsePage() {
  return (
    <LegalPage
      title="Research-use policy"
      updated={`Version ${RESEARCH_USE_POLICY_VERSION}`}
      intro="Everything we sell is a research material for laboratory use. This page says what that means, who may buy, what we will not talk about, and what happens when an order or a question crosses the line."
    >
      <LegalSection id="meaning" heading="1. What research use means">
        <p>
          A research material is a chemical supplied for in vitro laboratory work — analytical, biochemical or cell
          work carried out by someone with the training and equipment to do it. It is not a drug, a supplement, a
          cosmetic or a food, and it is not made, tested or labeled for use in or on a person or an animal. Buying
          from us is buying a reagent, in the same sense a laboratory buys a reagent from any chemical supplier.
        </p>
      </LegalSection>

      <LegalSection id="who" heading="2. Who may buy">
        <p>
          You may order if you are at least {MINIMUM_AGE} years of age, you are buying for laboratory research —
          on your own account or for an organization — and you have the training, equipment and facilities to
          receive, store and handle research materials safely. We ask you to say which setting you work in when you
          create an account, and we may ask for more before or after accepting an order. We do not sell to anyone
          who intends to use a material on themselves, on another person or on an animal, and we do not sell for
          resale to consumers.
        </p>
      </LegalSection>

      <LegalSection id="acknowledgement" heading="3. What you confirm">
        <p>
          The statements below are confirmed when an account is created and again at every checkout. Each
          confirmation is recorded with its version and time against the account and the order.
        </p>
        <p className="border-l-2 border-primary bg-secondary px-4 py-3 text-foreground">
          <span className="block font-mono text-[11px] uppercase tracking-[0.1em] text-muted-foreground">
            Research-use acknowledgement, version {RUO_VERSION}
          </span>
          <span className="mt-2 block">{RUO_ACKNOWLEDGEMENT}</span>
          <span className="mt-3 block font-semibold">{AGE_STATEMENT}</span>
        </p>
      </LegalSection>

      <LegalSection id="not-discussed" heading="4. What we do not discuss">
        <p>
          We do not provide dosing, reconstitution for administration, injection or any other route of
          administration, cycles, stacking, expected effects in people or animals, or anything that would be
          medical advice. This applies on product pages, by email, in the feedback panel and on any channel that
          carries our name. Our support team answers questions about orders, lots, documentation, storage and
          shipping. A question outside that is declined with a short reply rather than answered, and repeated
          questions of that kind end our service.
        </p>
        <p>
          Product pages describe a material by its name, identifiers, specification, form, quantity and storage
          condition. We do not publish testimonials, reviews, before-and-after accounts, comparisons with medicines,
          or references to conditions a material might be associated with, and we do not accept them from
          customers.
        </p>
      </LegalSection>

      <LegalSection id="review" heading="5. How orders are reviewed">
        <p>
          Every order is checked before it is picked. We look at what was ordered, where it is going, what was
          written in notes and correspondence, and whether the confirmations were given. An order that indicates a
          use other than laboratory research is cancelled and refunded in full, the account is closed, and the
          refusal is recorded against the order and the account so that later orders from the same person or
          address can be declined.
        </p>
      </LegalSection>

      <LegalSection id="documentation" heading="6. What you receive">
        <p>
          Every lot is tested by an independent laboratory before release, and every order ships with the
          certificate of analysis for the lot supplied. The certificate names the laboratory, the method and the
          result; the same document is pinned to your order and can be opened from your order page at any time.
          Nothing in the parcel, on the label or in the documentation is guidance for use.
        </p>
      </LegalSection>

      <LegalSection id="report" heading="7. Reporting misuse">
        <p>
          If you become aware of our material being used, offered or described outside laboratory research —
          including by someone reselling it — tell us at{' '}
          <span className="font-semibold text-foreground">{SUPPORT.email}</span>. We act on reports and do not
          disclose who made them.
        </p>
      </LegalSection>

      <LegalSection id="related" heading="8. Related pages">
        <p>
          The{' '}
          <Link href="/legal/terms" className="font-semibold text-primary">
            terms of sale
          </Link>{' '}
          make this policy part of every order. The{' '}
          <Link href="/legal/compliance" className="font-semibold text-primary">
            compliance and disclosures page
          </Link>{' '}
          shows where each statement is made and recorded, step by step.
        </p>
      </LegalSection>
    </LegalPage>
  );
}
