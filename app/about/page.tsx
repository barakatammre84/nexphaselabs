import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { ResearchNoticeBlock } from '@/components/site/research-notice';
import { openCheckoutEnabled } from '@/lib/site-config';

export const metadata: Metadata = {
  title: 'About',
  description:
    'NexPhase Labs supplies research materials to qualified laboratory organizations in the United States, with lot-specific analytical documentation on every shipment.',
};

/**
 * Corporate facts here are the ones on record: operating entity, state of
 * organisation, trading name and facility city. Nothing is published that
 * cannot be evidenced; the founding year is left for the owner to confirm.
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
  const open = openCheckoutEnabled();
  return (
    <main className="text-foreground">
      <section className="mx-auto max-w-[1280px] px-4 pb-8 pt-3 sm:px-6">
        <div className="ion-page-hero px-7 py-14 sm:px-12 lg:px-16 lg:py-20">
          <p className="ion-kicker">About NexPhase Labs</p>
          <h1 className="ion-heading mt-7 max-w-4xl text-[clamp(3rem,6vw,5.5rem)]">
            Research-grade confidence starts with the record.
          </h1>
          <p className="mt-7 max-w-2xl text-lg leading-8 text-muted-foreground">
            NexPhase Labs is an independent U.S. supplier of research materials.
            We pair clear chemical identity with lot-specific analytical records
            and a straightforward customer experience.
          </p>
        </div>
      </section>

      <section className="mx-auto max-w-[1280px] px-4 py-12 sm:px-6">
        <p className="ion-kicker">How we operate</p>
        <h2 className="ion-heading mt-5 max-w-2xl text-4xl sm:text-5xl">
          Quality assurance without the guesswork.
        </h2>
        <div className="mt-10 grid gap-5 sm:grid-cols-2">
          {principles.map((principle, index) => (
            <article key={principle.title} className="ion-panel p-7 lg:p-9">
              <span className="grid size-9 place-items-center rounded-full bg-primary font-display text-xs font-extrabold text-white">0{index + 1}</span>
              <h3 className="mt-6 font-display text-xl font-extrabold tracking-tight text-[var(--ion-navy)]">
                {open && index === 1 ? 'Ordering stays straightforward' : principle.title}
              </h3>
              <p className="mt-3 leading-7 text-muted-foreground">
                {open && index === 1
                  ? 'Published prices and eligible released lots appear directly on the product page. Add a pack to the cart and complete delivery details without creating an account.'
                  : principle.copy}
              </p>
            </article>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-[1280px] px-4 pb-20 pt-8 sm:px-6">
        <div className="ion-panel grid gap-10 p-7 sm:p-10 lg:grid-cols-[1fr_1fr] lg:items-center lg:p-12">
          <div>
            <p className="utility-label text-primary">Working with us</p>
            <h2 className="mt-3 font-display text-3xl font-extrabold tracking-[-0.04em] sm:text-4xl">
              Start with the product. Keep the documentation close.
            </h2>
            <p className="mt-5 leading-8 text-muted-foreground">
              Product specifications, handling details, and the documentation
              model are public so you can evaluate fit before ordering. Current
              lot availability and commercial terms appear where access allows.
            </p>
            <div className="mt-8 flex flex-col gap-4 sm:flex-row">
              <Link
                href="/catalog"
                className="inline-flex h-12 items-center justify-center gap-3 bg-primary px-6 text-sm font-bold text-primary-foreground transition-colors hover:bg-primary/90"
              >
                Shop products <ArrowRight className="size-4" />
              </Link>
              <Link
                href={open ? '/documentation/lot-lookup' : '/access'}
                className="inline-flex h-12 items-center justify-center border border-foreground/20 px-6 text-sm font-bold transition-colors hover:border-primary hover:text-primary"
              >
                {open ? 'View COAs' : 'Request access'}
              </Link>
            </div>
          </div>
          <div className="rounded-[1.5rem] bg-secondary p-7 lg:p-9">
            <p className="utility-label text-muted-foreground">Contact</p>
            <p className="mt-4 font-display text-2xl font-bold tracking-tight">research@nexphaselabs.net</p>
            <p className="mt-4 leading-7 text-muted-foreground">
              Questions about a specification, a lot, or an open account reach a person who can pull the record and
              answer directly.
            </p>
            <dl className="mt-8 border-t border-border">
              {[
                ['Operating entity', '8486 Ventures LLC'],
                ['Organised in', 'California, United States'],
                ['Trading as', 'NexPhase Labs'],
                ['Facility', 'Oakland, California'],
              ].map(([k, v]) => (
                <div key={k} className="grid gap-1 border-b border-border py-3 sm:grid-cols-[160px_1fr]">
                  <dt className="text-sm font-semibold text-muted-foreground">{k}</dt>
                  <dd className="text-sm">{v}</dd>
                </div>
              ))}
            </dl>
          </div>
        </div>
      </section>

      <ResearchNoticeBlock />
    </main>
  );
}
