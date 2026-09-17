import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowRight, BookOpen, Clock } from 'lucide-react';
import { ResearchNoticeBlock } from '@/components/site/research-notice';
import { GUIDES } from '@/lib/guides';

export const metadata: Metadata = {
  title: 'Laboratory guides',
  description:
    'Chemistry and quality-control reference for research peptides: reading a certificate of analysis, how purity and identity are measured, solubility in laboratory solvents, storage and traceability.',
};

/**
 * The guide index. Deliberately no route from here into the catalog: this section is reference
 * material, and CLAUDE.md keeps reference material apart from the order path.
 */
export default function GuidesIndexPage() {
  return (
    <main className="text-foreground">
      <section className="mx-auto max-w-[1280px] px-4 pb-8 pt-3 sm:px-6">
        <div className="ion-page-hero px-7 py-14 sm:px-12 lg:px-16 lg:py-20">
          <p className="ion-kicker">Laboratory reference</p>
          <h1 className="ion-heading mt-7 max-w-4xl text-[clamp(2.6rem,5.4vw,4.8rem)]">
            How the measurements are made.
          </h1>
          <p className="mt-7 max-w-2xl text-lg leading-8 text-muted-foreground">
            Chemistry and quality-control reference, written for people who will be asked to
            defend their reagents. No product is named in this section, and nothing here is a
            protocol for using one.
          </p>
          <div className="mt-9 flex flex-wrap gap-3">
            <Link href="/documentation/lot-lookup" className="action-primary gap-2">
              Search released lots <ArrowRight className="size-4" />
            </Link>
            <Link href="/documentation" className="action-secondary">
              Documentation &amp; QC
            </Link>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-[1280px] px-4 py-12 sm:px-6">
        <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {GUIDES.map((guide) => (
            <li key={guide.slug}>
              <Link
                href={`/documentation/guides/${guide.slug}`}
                className="ion-panel flex h-full flex-col gap-4 p-7 transition-colors hover:border-primary"
              >
                <BookOpen className="size-5 text-primary" />
                <h2 className="font-display text-lg font-bold leading-snug">{guide.title}</h2>
                <p className="text-sm leading-6 text-muted-foreground">{guide.summary}</p>
                <span className="mt-auto inline-flex items-center gap-2 text-xs font-semibold text-muted-foreground">
                  <Clock className="size-3.5" /> {guide.minutes} minute read
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <section className="mx-auto max-w-[1280px] px-4 pb-20 sm:px-6">
        <div className="ion-panel p-7 sm:p-10">
          <p className="ion-kicker">Why this section exists</p>
          <h2 className="ion-heading mt-4 max-w-2xl text-3xl">
            A reagent you cannot account for is a result you cannot defend.
          </h2>
          <p className="mt-5 max-w-3xl leading-8 text-muted-foreground">
            Most of what is written about research peptides online is about what they might do in a
            body. None of that is our business, and none of it helps a laboratory judge the material
            it has been sent. These pages cover the part that does: how a purity figure is produced,
            what confirms identity, what a certificate has to contain to be checkable, and how a lot
            stays traceable from the manufacturer to your bench.
          </p>
          <p className="mt-4 max-w-3xl leading-8 text-muted-foreground">
            We do not publish preparation instructions, reconstitution volumes, protocols or dose
            conversions, and we decline requests for them.
          </p>
        </div>
      </section>

      <ResearchNoticeBlock />
    </main>
  );
}
