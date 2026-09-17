import type { Metadata } from 'next';
import Link from 'next/link';
import { accountRequired, appEnv, openCheckoutEnabled } from '@/lib/site-config';
import { MINIMUM_AGE, SHIPPING_CUTOFF } from '@/lib/policy';
import { SUPPORT } from '@/lib/support';
import { ArrowRight } from 'lucide-react';
import { ResearchNoticeBlock } from '@/components/site/research-notice';
import { FaqExplorer, type FaqSection } from '@/components/site/faq-explorer';

export const metadata: Metadata = {
  title: 'FAQ',
  description:
    'Common questions about ordering from NexPhase Labs, lot documentation, shipping, returns, and the research-use boundary.',
};

type Section = FaqSection;

/**
 * Where /access sends a visitor while the storefront is closed (app/access/page.tsx):
 * the wholesale application, which starts at sign-up. There is no access page to name.
 */
const WHOLESALE_APPLICATION = '/account/sign-up?tier=institutional';

const ordering: Section = {
  heading: 'Ordering',
  items: [
    {
      q: 'Do I need an account to order?',
      a: 'No. Add a pack size to your cart and check out as a guest. An account is optional; it keeps your orders, addresses and the certificates that shipped with each order in one place. Either way you confirm the age statement and the research-use acknowledgement at checkout.',
    },
    {
      q: 'Who can order?',
      a: `Anyone who is at least ${MINIMUM_AGE} years of age, is buying for laboratory research — independently or for an organization — and has the training and facilities to handle research materials safely. Orders ship to street addresses in the United States, including home laboratories.`,
    },
    {
      q: 'Which payment methods do you accept?',
      a: 'The payment methods available are shown at checkout before you pay. Never send money to an address or account that was not shown to you on the checkout page.',
    },
    {
      q: 'Can an order be refused?',
      a: 'Yes. Every order is checked before it is picked. An order that indicates a use outside laboratory research is cancelled and refunded in full, and the account is closed.',
    },
    {
      q: 'How do I see my order again?',
      a: 'With an account, open Your orders. As a guest, use Your orders in the same browser used at checkout; your private guest session lasts 30 days. Keep your order number for support.',
    },
    {
      q: 'Why can’t I add a particular pack size?',
      a: 'A pack size can only be ordered when it has a published price and a released lot with its certificate on file. If a pack size is unavailable, contact support and we will tell you when it is expected.',
    },
  ],
};

const documentation: Section = {
  heading: 'Documentation and quality',
  items: [
    {
      q: 'What documentation ships with an order?',
      a: 'The certificate of analysis for the specific lot supplied, which names the testing laboratory, the method and the results, together with a packing slip listing every lot number. The same certificate is pinned to your order page, and any lot we have sold can be looked up by lot number.',
    },
    {
      q: 'Why do the catalog pages not list a purity percentage?',
      a: 'Purity is a property of a lot, not of a product line. Publishing one figure for every lot of a material would be misleading, so purity is reported on the certificate issued for the lot you receive.',
    },
    {
      q: 'Can I see a certificate before ordering?',
      a: 'Yes. Released lots can be looked up by lot number on the lot lookup page, and the certificate opens from there. If the product page does not show which lot is currently shipping, ask support for the lot number.',
    },
    {
      q: 'How do I know the certificate is real?',
      a: 'Because you can check it without us. Every certificate names the laboratory that did the testing and that laboratory\u2019s own reference for the sample, so you can contact them directly and ask whether the report is theirs. A certificate that names no laboratory cannot be verified by anybody except the seller who printed it.',
      link: { href: '/documentation/guides/reading-a-certificate-of-analysis', label: 'How to read a certificate of analysis' },
    },
    {
      q: 'What happens if the paperwork and the vial do not agree?',
      a: 'Stop and contact us before using the material. A mismatch between the label and the certificate puts that lot on hold while it is checked, and the line is replaced or refunded.',
    },
  ],
};

const materialAndHandling: Section = {
  heading: 'The material itself',
  items: [
    {
      q: 'What does the material look like?',
      a: 'A lyophilized solid, in a sealed glass vial under a crimped or flip-off seal. Depending on the run it can be a compact cake, a loose fluffy mass, or a thin film on the glass. At small fill weights a few milligrams spread across the bottom of a vial can be genuinely hard to see, which is normal.',
      link: { href: '/documentation/guides/storage-stability-and-retest-dates', label: 'Storage, stability and retest dates' },
    },
    {
      q: 'The cake looks different from my last order. Is something wrong?',
      a: 'Almost certainly not. Cake appearance depends on fill volume, freezing rate and the shelf position in the dryer, and it varies between runs of the same material. Appearance is recorded on the certificate as an observation, not as a specification. What should match exactly is the lot number on the vial, the certificate and the packing slip.',
    },
    {
      q: 'What is printed on the vial?',
      a: 'The material name and catalog code, the lot number, the nominal fill weight, the storage condition, and the research-use statement. The lot number is the one to quote in any question about what you received.',
    },
    {
      q: 'The parcel arrived warm, or the ice packs had thawed. What now?',
      a: 'Photograph the parcel and its contents before unpacking further and contact us the same day with the order number. Coolant is expected to be partly thawed on arrival; a shipment that is warm to the touch is not. We will tell you whether the lot can still be used or replace it.',
    },
    {
      q: 'Can I open the vial and use part of it?',
      a: 'What you do with material in your own laboratory is yours to decide, within the research-use conditions you accepted. We would only note that a vial opened and resealed is no longer covered by the storage assumptions on the certificate, and that we cannot accept a return of anything unsealed.',
    },
  ],
};

const shipping: Section = {
  heading: 'Shipping and returns',
  items: [
    {
      q: 'Where do you ship?',
      a: 'To street addresses in the United States, residential or business. We do not ship to PO boxes, mailbox services, freight forwarders or addresses outside the United States.',
    },
    {
      q: 'When will my order ship?',
      a: `Orders paid before ${SHIPPING_CUTOFF} on a business day ship the same day; later orders ship the next business day. Temperature-sensitive material may be held to the next business day around a weekend or holiday. Tracking is emailed when the parcel is handed to the carrier.`,
    },
    {
      q: 'How is cold material shipped?',
      a: 'In an insulated shipper with ice packs, with the storage condition stated on the catalog page and the packing slip. Move material to its storage condition as soon as it arrives.',
    },
    {
      q: 'What is your returns policy?',
      a: 'Unopened, sealed material can be returned within 30 days of delivery with a return authorization from us; you pay the return shipping unless the return is our error. Damaged, missing or wrong items should be reported within 48 hours with photographs and are replaced or refunded. Returned material is never restocked.',
    },
    {
      q: 'Tracking has not updated for a few days.',
      a: 'Carrier scans can go quiet in transit, and a parcel with no movement for two business days is worth raising rather than waiting on. Send us the order number and we will open it with the carrier. We do not consider a domestic parcel lost until it has been stationary for seven days.',
    },
    {
      q: 'The parcel arrived damaged, or something is missing.',
      a: 'Report it within 48 hours with photographs of the outer box, the packing and the vials as they arrived. We replace or refund; we do not ask you to return damaged material, and we do not restock anything that has been out of our control.',
    },
    {
      q: 'The carrier says delivered and I do not have it.',
      a: 'Check with anyone else at the address and look for a safe-place photograph on the tracking page first, because most of these turn up. If it does not, tell us within 48 hours of the delivery scan. We open a carrier trace, and where the trace fails we replace the order once to the same address.',
    },
    {
      q: 'Can I change or cancel an order after placing it?',
      a: 'Until it is picked, yes; after it is picked, no, because the lot has been allocated and the documents generated. Contact support immediately with the order number. An address change after dispatch has to go through the carrier and we cannot guarantee it.',
    },
    {
      q: 'How long does a refund take?',
      a: 'Five to seven business days from when we inspect the returned parcel, paid back to the payment method used for the order. Your bank may take a few more days to show it.',
    },
  ],
};

const researchUse: Section = {
  heading: 'Research use',
  items: [
    {
      q: 'Can these materials be used in or on people or animals?',
      a: 'No. Every material is supplied for laboratory research use only. They are not for human or veterinary use, not for clinical or diagnostic procedures, and not for consumption.',
    },
    {
      q: 'Will you advise on dosing, reconstitution or administration?',
      a: 'No. We do not provide dosing guidance, administration protocols, or medical advice of any kind, and there are no exceptions. Support answers questions about orders, lots, documentation, storage and shipping only.',
    },
    {
      q: 'What happens if I ask anyway?',
      a: 'The question is declined with a short reply. Repeated questions of that kind, or anything that indicates a use outside laboratory research, close the account.',
    },
    {
      q: 'Are these products approved by the FDA?',
      a: 'No. These are research chemicals, not drugs, medicines, dietary supplements, cosmetics, food or consumer products, and no statement on this site has been evaluated by the Food and Drug Administration.',
    },
    {
      q: 'Why do you ask my age?',
      a: `Research materials are sold to adults. You confirm that you are at least ${MINIMUM_AGE} when you enter the site, when you create an account and at every checkout, and the confirmation is recorded against the order.`,
    },
    {
      q: 'Do you have a misuse policy?',
      a: 'Yes, and it is published rather than implied. Our community guidelines set out what may and may not be said about these materials anywhere our name appears, including in reviews, on social platforms and by our partners. Content describing human or animal use, a dose, or a medical benefit is removed, the account is closed, and where it suggests harm we report it.',
      link: { href: '/legal/community-guidelines', label: 'Read the community guidelines' },
    },
    {
      q: 'Who is responsible for compliance?',
      a: 'The purchaser is responsible for compliance with all applicable federal, state and local law, and for the safe handling, storage, use and disposal of every material received.',
    },
  ],
};

const institutionalAccess: Section = {
  heading: 'Access and ordering',
  items: [
    {
      q: 'Can an individual order from NexPhase Labs?',
      a: 'Not yet. Materials are currently supplied to organizations with a wholesale account while the storefront is prepared.',
      link: { href: WHOLESALE_APPLICATION, label: 'Apply for a wholesale account' },
    },
    {
      q: 'How long does account review take?',
      a: 'A complete application is usually decided within two business days. Incomplete applications are the main cause of delay, so fill in every organization detail the application asks for and attach any supporting documents you have.',
      link: { href: WHOLESALE_APPLICATION, label: 'Apply for a wholesale account' },
    },
    {
      q: 'Can an account be declined or closed?',
      a: 'Yes. Approval is conditional on research use. NexPhase Labs may decline a request or close an account at any time, including where intended use falls outside the research-use policy.',
    },
  ],
};

/**
 * Owner decision of 16 September 2026: an account is required to order. Two
 * answers say so; everything else about ordering holds.
 */
function orderingFor(requireAccount: boolean): Section {
  if (!requireAccount) return ordering;
  return {
    ...ordering,
    items: ordering.items.map((item) =>
      item.q === 'Do I need an account to order?'
        ? {
            ...item,
            a: 'Yes. Create a research account with your email, confirm it, and acknowledge the research-use conditions; then add a pack size to your cart. Your orders, saved addresses and the certificates that shipped with each order stay in one place. Organizations that need purchase orders or net terms apply for a wholesale account at sign-up.',
          }
        : item.q === 'How do I see my order again?'
          ? { ...item, a: 'Sign in and open Your orders. Keep your order number for support.' }
          : item,
    ),
  };
}

export default function FaqPage() {
  const open = openCheckoutEnabled();
  const orderingSection = orderingFor(accountRequired());
  const testEnvironment = appEnv() !== 'production';
  const sections: Section[] = open
    ? [
        testEnvironment
          ? {
              ...orderingSection,
              items: [
                ...orderingSection.items,
                {
                  q: 'Will a test-environment purchase charge me?',
                  a: 'No. This environment uses clearly labeled simulated payments. Never send money for an order placed here.',
                },
              ],
            }
          : orderingSection,
        documentation,
        materialAndHandling,
        shipping,
        researchUse,
      ]
    : [institutionalAccess, documentation, materialAndHandling, shipping, researchUse];
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
            Ordering, lot documentation, what the material physically is, shipping, returns and the research-use boundary.
          </p>
        </div>
      </section>

      <section className="mx-auto max-w-[1080px] px-4 py-10 sm:px-6">
        <FaqExplorer sections={sections} />
      </section>

      <section className="mx-auto max-w-[1080px] px-4 pb-20 sm:px-6">
        <div className="ion-panel flex flex-col items-start justify-between gap-6 p-7 sm:flex-row sm:items-center sm:p-9">
          <div>
            <p className="ion-kicker">Need a person?</p>
            <h2 className="ion-heading mt-4 text-3xl">Get help from NexPhase support.</h2>
            <p className="mt-3 text-sm leading-6 text-muted-foreground">
              {SUPPORT.hours}. First reply {SUPPORT.firstReply}.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Link href="/contact" className="action-primary">
              Contact support
            </Link>
            <Link href={open ? '/catalog' : WHOLESALE_APPLICATION} className="action-secondary gap-2">
              {open ? 'Shop products' : 'Apply for a wholesale account'} <ArrowRight className="size-4" />
            </Link>
          </div>
        </div>
      </section>

      <ResearchNoticeBlock />
    </main>
  );
}
