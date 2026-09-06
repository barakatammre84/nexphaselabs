import type { Metadata } from 'next';
import Link from 'next/link';
import { openCheckoutEnabled } from '@/lib/site-config';
import { ArrowRight } from 'lucide-react';
import { ResearchNoticeBlock } from '@/components/site/research-notice';
import { FaqExplorer } from '@/components/site/faq-explorer';

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
      <section className="mx-auto max-w-[1280px] px-4 pb-8 pt-3 sm:px-6">
        <div className="ion-hero px-7 py-14 sm:px-12 lg:px-16 lg:py-20">
          <p className="inline-flex rounded-full border border-white/20 bg-white/10 px-4 py-2 text-xs font-extrabold">
            Help center
          </p>
          <h1 className="mt-7 max-w-3xl font-display text-[clamp(3rem,6vw,5.5rem)] font-extrabold leading-[0.95] tracking-[-0.065em]">
            How can we help?
          </h1>
          <p className="mt-6 max-w-2xl text-lg leading-8 text-white/72">
            Find quick answers about products, batch documentation, ordering,
            shipping, and your NexPhase account.
          </p>
        </div>
      </section>

      <section className="mx-auto max-w-[1080px] px-4 py-10 sm:px-6">
        <FaqExplorer
          sections={displayedSections.map((section) => ({
            ...section,
            items: section.items.map((item) => ({
              ...item,
              a: open
                ? item.a
                    .replace('Verified accounts can request', 'You can request')
                    .replace('purchasing organization', 'purchaser')
                : item.a,
            })),
          }))}
        />
      </section>

      <section className="mx-auto max-w-[1080px] px-4 pb-20 sm:px-6">
        <div className="ion-panel flex flex-col items-start justify-between gap-6 p-7 sm:flex-row sm:items-center sm:p-9">
          <div>
            <p className="ion-kicker">Need a person?</p>
            <h2 className="ion-heading mt-4 text-3xl">Get help from NexPhase support.</h2>
          </div>
          <div className="flex flex-wrap gap-3">
            <a href="mailto:research@nexphaselabs.net" className="action-primary">Contact support</a>
            <Link href={open ? '/catalog' : '/access'} className="action-secondary gap-2">
              {open ? 'Shop products' : 'Request access'} <ArrowRight className="size-4" />
            </Link>
          </div>
        </div>
      </section>

      <ResearchNoticeBlock />
    </main>
  );
}
