import type { Metadata } from 'next';
import Link from 'next/link';
import { openCheckoutEnabled } from '@/lib/site-config';
import { ArrowRight } from 'lucide-react';
import { ResearchNoticeBlock } from '@/components/site/research-notice';

export const metadata: Metadata = {
  title: 'FAQ',
  description:
    'Common questions about NexPhase Labs research accounts, documentation, specifications, storage, and the research-use boundary.',
};

const sections = [
  {
    heading: 'Access and ordering',
    items: [
      {
        q: 'Can an individual order from NexPhase Labs?',
        a: 'No. Materials are supplied to qualified organizations only. Requests from individuals, and requests shipping to residential addresses, are declined.',
      },
      {
        q: 'How long does account review take?',
        a: 'A complete request is usually decided within two business days. Incomplete requests are the main cause of delay, so send everything listed on the research access page in the first message.',
      },
      {
        q: 'Why is pricing not shown publicly?',
        a: 'Pricing and current lot availability are shown to verified accounts. Specifications, storage conditions, and the documentation package are public so a laboratory can evaluate fit before requesting an account.',
      },
      {
        q: 'Can an account be declined or closed?',
        a: 'Yes. Approval is conditional on research use. NexPhase Labs may decline a request or close an account at any time, including where intended use falls outside the research-use policy.',
      },
    ],
  },
  {
    heading: 'Documentation and quality',
    items: [
      {
        q: 'What documentation ships with an order?',
        a: 'A certificate of analysis for the specific lot, the HPLC purity chromatogram, mass spectrometry identity confirmation, and the lot number and manufacture date. Storage and handling guidance is packed with the shipment.',
      },
      {
        q: 'Why do the catalog pages not list a purity percentage?',
        a: 'Purity is a property of a lot, not of a product line. Publishing a single figure for every lot of a material would be misleading, so purity is reported on the certificate issued for the lot you receive.',
      },
      {
        q: 'Can a certificate be reviewed before ordering?',
        a: 'Yes. Verified accounts can request the certificate for the current lot before placing an order.',
      },
      {
        q: 'What happens if the paperwork and the vial do not agree?',
        a: 'Stop and contact us before using the material. A mismatch between the label and the certificate is treated as a hold on that lot.',
      },
    ],
  },
  {
    heading: 'Handling and shipping',
    items: [
      {
        q: 'How should material be stored on arrival?',
        a: 'Follow the conditions on the catalog page for that material and on the sheet packed with the shipment. Most lyophilized materials are held at -20 °C, protected from light. Solubility in laboratory solvents is published per material where a supplier has published it.',
      },
      {
        q: 'Is cold-chain shipping available?',
        a: 'Yes. Some materials ship cold-chain by default and it is available on request for others. The catalog page for each material states which applies.',
      },
      {
        q: 'Does NexPhase Labs ship internationally?',
        a: 'Shipping is currently within the United States. Requests from outside the United States are reviewed case by case and may not be possible depending on the destination.',
      },
    ],
  },
  {
    heading: 'Research use',
    items: [
      {
        q: 'Can these materials be used in or on people or animals?',
        a: 'No. Every material is supplied for laboratory research use only. They are not for human or veterinary use, not for clinical or diagnostic procedures, and not for consumption.',
      },
      {
        q: 'Will NexPhase Labs advise on dosing or administration?',
        a: 'No. We do not provide dosing guidance, administration protocols, or medical advice of any kind, and we cannot make exceptions to this.',
      },
      {
        q: 'Are these products approved by the FDA?',
        a: 'No. These are not drugs, medicines, dietary supplements, cosmetics, food, or consumer products, and no statement on this site has been evaluated by the Food and Drug Administration.',
      },
      {
        q: 'Who is responsible for compliance?',
        a: 'The purchasing organization is responsible for compliance with all applicable federal, state, and local law, and for the safe handling, use, and disposal of every material received.',
      },
    ],
  },
];

export default function FaqPage() {
  const open = openCheckoutEnabled();
  const displayedSections = open
    ? [
        {
          heading: 'Ordering and guest checkout',
          items: [
            {
              q: 'Do I need an account or approval to order?',
              a: 'No. Add a pack size to your cart and check out as a guest. There is no email verification or organization approval step. Research-use conditions still apply.',
            },
            {
              q: 'How do I see my order again?',
              a: 'Use Your orders in the same browser used at checkout. Your private guest session lasts 30 days. Save your order number for support; entering an email does not create an account.',
            },
            {
              q: 'Will a staging purchase charge me?',
              a: 'No. Staging uses clearly labeled simulated payments. Never send money for a staging order.',
            },
            {
              q: 'Why can’t I add a particular pack size?',
              a: 'A pack size needs a published price and a released lot before it can be ordered. Contact support if either is unavailable.',
            },
          ],
        },
        ...sections.slice(1),
      ]
    : sections;
  return (
    <main className="bg-background text-foreground">
      <section className="mx-auto max-w-[1500px] border-b border-border px-5 py-14 sm:px-8 lg:px-12 lg:py-20">
        <p className="utility-label flex items-center gap-3 text-primary">
          <span className="h-px w-8 bg-primary" />
          Frequently asked questions
        </p>
        <h1 className="mt-7 max-w-3xl font-display text-[clamp(2.6rem,5vw,4.6rem)] font-extrabold leading-[0.92] tracking-[-0.06em]">
          The questions laboratories actually ask.
        </h1>
        <p className="mt-7 max-w-2xl text-lg leading-8 text-muted-foreground">
          If something here is unclear, or your question is specific to a lot,
          write to{' '}
          <a
            href="mailto:research@nexphaselabs.net"
            className="font-semibold text-primary hover:underline"
          >
            research@nexphaselabs.net
          </a>
          .
        </p>
      </section>

      {displayedSections.map((section) => (
        <section
          key={section.heading}
          className="mx-auto max-w-[1500px] border-b border-border px-5 py-14 sm:px-8 lg:px-12"
        >
          <div className="grid gap-10 lg:grid-cols-[0.7fr_1.3fr]">
            <h2 className="font-display text-2xl font-extrabold tracking-[-0.04em] sm:text-3xl">
              {section.heading}
            </h2>
            <dl className="border-t border-border">
              {section.items.map((item) => (
                <div key={item.q} className="border-b border-border py-6">
                  <dt className="font-display text-lg font-bold leading-snug tracking-tight">
                    {item.q}
                  </dt>
                  <dd className="mt-3 max-w-3xl leading-7 text-muted-foreground">
                    {open
                      ? item.a
                          .replace(
                            'Verified accounts can request',
                            'You can request',
                          )
                          .replace('purchasing organization', 'purchaser')
                      : item.a}
                  </dd>
                </div>
              ))}
            </dl>
          </div>
        </section>
      ))}

      <section className="mx-auto max-w-[1500px] px-5 py-14 sm:px-8 lg:px-12">
        <Link
          href={open ? '/catalog' : '/access'}
          className="inline-flex items-center gap-2 text-sm font-bold text-primary"
        >
          {open ? 'Browse materials' : 'Request a research account'}{' '}
          <ArrowRight className="size-4" />
        </Link>
      </section>

      <ResearchNoticeBlock />
    </main>
  );
}
