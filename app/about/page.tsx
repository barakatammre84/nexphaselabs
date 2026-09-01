import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { ResearchNoticeBlock } from '@/components/site/research-notice';

export const metadata: Metadata = {
  title: 'About',
  description:
    'NexPhase Labs supplies research materials to qualified laboratory organizations in the United States, with lot-specific analytical documentation on every shipment.',
};

/**
 * TODO before launch - replace with the real corporate facts:
 * registered entity name, state of incorporation, year founded, and the
 * leadership section below. Do not publish claims that cannot be evidenced.
 */

const principles = [
  {
    title: 'The lot is the unit of truth',
    copy: 'Quality claims that describe a product line are marketing. Quality claims that describe a lot are useful. Every certificate we issue is tied to a lot number, and the chromatogram is attached rather than summarized.',
  },
  {
    title: 'Access is reviewed',
    copy: 'We do not sell to the general public and we do not open accounts from a form alone. Every request is read by a person against a written research-use policy, and requests outside it are declined.',
  },
  {
    title: 'We stay inside our lane',
    copy: 'We supply materials and the analytical record that goes with them. We do not give dosing guidance, administration protocols, or medical advice, and we do not make claims about outcomes in people.',
  },
  {
    title: 'Say the hard part first',
    copy: 'If a lot is short, delayed, or fails a specification, the customer hears it from us before they find it themselves. That is the whole basis of a supply relationship a laboratory can plan around.',
  },
];

export default function AboutPage() {
  return (
    <main className="bg-background text-foreground">
      <section className="mx-auto max-w-[1500px] border-b border-border px-5 py-14 sm:px-8 lg:px-12 lg:py-20">
        <p className="utility-label flex items-center gap-3 text-primary">
          <span className="h-px w-8 bg-primary" />
          About NexPhase Labs
        </p>
        <h1 className="mt-7 max-w-4xl font-display text-[clamp(2.6rem,5vw,4.6rem)] font-extrabold leading-[0.92] tracking-[-0.06em]">
          A supplier built around the record, not the pitch.
        </h1>
        <p className="mt-7 max-w-2xl text-lg leading-8 text-muted-foreground">
          NexPhase Labs is an independent supplier of research materials to qualified laboratory organizations in
          the United States. The catalog is deliberately narrow, the documentation is deliberately specific, and
          access is deliberately reviewed.
        </p>
      </section>

      <section className="mx-auto max-w-[1500px] border-b border-border px-5 py-14 sm:px-8 lg:px-12">
        <h2 className="max-w-2xl font-display text-3xl font-extrabold tracking-[-0.04em] sm:text-4xl">
          How we operate
        </h2>
        <div className="mt-10 grid gap-px bg-border sm:grid-cols-2">
          {principles.map((principle, index) => (
            <article key={principle.title} className="bg-background p-7 lg:p-9">
              <span className="font-mono text-[11px] text-muted-foreground">0{index + 1}</span>
              <h3 className="mt-6 font-display text-xl font-bold tracking-tight">{principle.title}</h3>
              <p className="mt-3 leading-7 text-muted-foreground">{principle.copy}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-[1500px] border-b border-border px-5 py-14 sm:px-8 lg:px-12">
        <div className="grid gap-10 lg:grid-cols-[1fr_1fr] lg:items-center">
          <div>
            <p className="utility-label text-primary">Working with us</p>
            <h2 className="mt-3 font-display text-3xl font-extrabold tracking-[-0.04em] sm:text-4xl">
              Start with the catalog, then the account.
            </h2>
            <p className="mt-5 leading-8 text-muted-foreground">
              Specifications, storage conditions, and the documentation package are public so a laboratory can
              evaluate the fit before anyone fills in a form. Pricing and current lot availability open up once an
              account is verified.
            </p>
            <div className="mt-8 flex flex-col gap-4 sm:flex-row">
              <Link
                href="/catalog"
                className="inline-flex h-12 items-center justify-center gap-3 bg-primary px-6 text-sm font-bold text-primary-foreground transition-colors hover:bg-primary/90"
              >
                View the catalog <ArrowRight className="size-4" />
              </Link>
              <Link
                href="/access"
                className="inline-flex h-12 items-center justify-center border border-foreground/20 px-6 text-sm font-bold transition-colors hover:border-primary hover:text-primary"
              >
                Request access
              </Link>
            </div>
          </div>
          <div className="border border-border bg-secondary p-7 lg:p-9">
            <p className="utility-label text-muted-foreground">Contact</p>
            <p className="mt-4 font-display text-2xl font-bold tracking-tight">research@nexphaselabs.net</p>
            <p className="mt-4 leading-7 text-muted-foreground">
              Questions about a specification, a lot, or an open account reach a person who can pull the record and
              answer directly.
            </p>
          </div>
        </div>
      </section>

      <ResearchNoticeBlock />
    </main>
  );
}
