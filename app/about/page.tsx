import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { ResearchNoticeBlock } from '@/components/site/research-notice';
import { ENTITY } from '@/lib/entity';
import { MINIMUM_AGE } from '@/lib/policy';
import { SUPPORT } from '@/lib/support';

export const metadata: Metadata = {
  title: 'About',
  description:
    'NexPhase Labs is an independent, family-run supplier of research peptides in Oakland, California. Every lot is tested by an independent laboratory and ships with its certificate.',
};

const commitments = [
  {
    title: 'Every lot is tested before it is sold',
    body: 'An independent laboratory tests each lot for identity and purity. The certificate names the laboratory, the method and the result, and a lot without one is never listed.',
  },
  {
    title: 'The certificate that ships is the one you keep',
    body: 'The certificate in the parcel is pinned to your order with a checksum. Open it from your order page a year from now and it is the same document.',
  },
  {
    title: 'Research use only, and we mean it',
    body: `We sell to researchers aged ${MINIMUM_AGE} and over, for laboratory work. We do not give dosing, reconstitution or administration guidance, we do not describe effects in people, and an order that points elsewhere is refunded and closed.`,
  },
  {
    title: 'You hear the hard part from us first',
    body: 'If a lot is short, delayed or fails a specification, we tell you before you find out yourself. That is the basis of a supplier a laboratory can plan around.',
  },
];

export default function AboutPage() {
  return (
    <main className="bg-background text-foreground">
      <section className="mx-auto max-w-[1280px] px-4 pb-8 pt-3 sm:px-6">
        <div className="ion-hero px-7 py-14 sm:px-12 lg:px-16 lg:py-20">
          <p className="inline-flex rounded-full border border-white/20 bg-white/10 px-4 py-2 text-xs font-extrabold">
            About NexPhase Labs
          </p>
          <h1 className="mt-7 max-w-3xl font-display text-[clamp(3rem,6vw,5.5rem)] font-extrabold leading-[0.95] tracking-[-0.065em]">
            Research peptides, verified by lot.
          </h1>
          <p className="mt-6 max-w-2xl text-lg leading-8 text-white/72">
            NexPhase Labs is an independent, family-run supplier of research materials in Oakland, California. We
            sell our own catalog of peptides and related research chemicals, each lot tested by an independent
            laboratory and shipped with its certificate of analysis.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link href="/catalog" className="action-primary">
              Shop products
            </Link>
            <Link href="/documentation/lot-lookup" className="action-secondary gap-2">
              View COAs <ArrowRight className="size-4" />
            </Link>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-[1280px] px-4 py-10 sm:px-6">
        <p className="ion-kicker">How we operate</p>
        <h2 className="ion-heading mt-4 max-w-2xl text-3xl sm:text-4xl">Four things you can hold us to.</h2>
        <div className="mt-8 grid gap-4 md:grid-cols-2">
          {commitments.map((item) => (
            <div key={item.title} className="ion-panel p-7">
              <h3 className="font-display text-xl font-bold tracking-tight">{item.title}</h3>
              <p className="mt-3 leading-7 text-muted-foreground">{item.body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-[1280px] px-4 py-6 sm:px-6">
        <div className="grid gap-4 lg:grid-cols-[1.2fr_1fr]">
          <div className="ion-panel p-7 sm:p-9">
            <p className="ion-kicker">Who we are</p>
            <h2 className="ion-heading mt-4 text-3xl">A small company, run by the people who own it.</h2>
            <p className="mt-4 leading-7 text-muted-foreground">
              {ENTITY.tradingName} is the trading name of {ENTITY.legalName}, a {ENTITY.jurisdiction} company owned and
              run by its members, with no outside investors. We receive, hold and ship our own inventory from{' '}
              {ENTITY.city}, {ENTITY.region}, and the people answering support are the people running the business.
            </p>
            <dl className="mt-6 grid gap-x-8 gap-y-3 text-sm sm:grid-cols-2">
              {[
                ['Operating entity', ENTITY.legalName],
                ['Trading as', ENTITY.tradingName],
                ['Organized in', `${ENTITY.jurisdiction}, ${ENTITY.country}`],
                ['Based in', `${ENTITY.city}, ${ENTITY.region}`],
              ].map(([label, value]) => (
                <div key={label} className="border-t border-border pt-3">
                  <dt className="utility-label text-muted-foreground">{label}</dt>
                  <dd className="mt-1 font-semibold">{value}</dd>
                </div>
              ))}
            </dl>
          </div>
          <div className="ion-panel p-7 sm:p-9">
            <p className="ion-kicker">Talk to a person</p>
            <h2 className="ion-heading mt-4 text-3xl">Questions reach someone who can pull the record.</h2>
            <p className="mt-4 leading-7 text-muted-foreground">
              Orders, lots, documentation, storage and shipping: write to{' '}
              <span className="font-semibold text-foreground">{SUPPORT.email}</span> or use the contact form. Hours are{' '}
              {SUPPORT.hours}; first reply {SUPPORT.firstReply}.
            </p>
            <p className="mt-4 text-sm leading-6 text-muted-foreground">{SUPPORT.outOfScope}</p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link href="/contact" className="action-primary">
                Contact us
              </Link>
              <Link href="/legal/compliance" className="action-secondary gap-2">
                Compliance &amp; disclosures <ArrowRight className="size-4" />
              </Link>
            </div>
          </div>
        </div>
      </section>

      <ResearchNoticeBlock />
    </main>
  );
}
