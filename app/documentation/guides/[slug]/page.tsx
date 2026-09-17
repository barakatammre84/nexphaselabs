import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, ArrowRight, Clock } from 'lucide-react';
import { ResearchNoticeBlock } from '@/components/site/research-notice';
import { GUIDES, guideBySlug, relatedGuides } from '@/lib/guides';

type Props = { params: Promise<{ slug: string }> };

export function generateStaticParams() {
  return GUIDES.map((guide) => ({ slug: guide.slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const guide = guideBySlug((await params).slug);
  if (!guide) return { title: 'Laboratory guides' };
  return { title: guide.title, description: guide.summary };
}

/**
 * One guide. The only outbound links are to other guides and to the lot records; there is no
 * path from reference material into the order path, which is the separation CLAUDE.md requires.
 */
export default async function GuidePage({ params }: Props) {
  const guide = guideBySlug((await params).slug);
  if (!guide) notFound();
  const related = relatedGuides(guide.slug);

  return (
    <main className="text-foreground">
      <section className="mx-auto max-w-[900px] px-4 py-10 sm:px-6">
        <Link
          href="/documentation/guides"
          className="inline-flex items-center gap-2 text-sm font-semibold text-muted-foreground hover:text-primary"
        >
          <ArrowLeft className="size-4" /> Laboratory guides
        </Link>

        <article className="mt-7">
          <h1 className="font-display text-[clamp(2.2rem,4.4vw,3.4rem)] font-extrabold leading-[1.03] tracking-[-0.05em]">
            {guide.title}
          </h1>
          <p className="mt-5 text-lg leading-8 text-muted-foreground">{guide.summary}</p>
          <p className="mt-4 inline-flex items-center gap-2 text-xs font-semibold text-muted-foreground">
            <Clock className="size-3.5" /> {guide.minutes} minute read
          </p>

          {guide.sections.map((section) => (
            <section key={section.heading} className="mt-10">
              <h2 className="font-display text-2xl font-bold tracking-[-0.03em]">{section.heading}</h2>
              {section.paragraphs.map((paragraph) => (
                <p key={paragraph.slice(0, 40)} className="mt-4 leading-8 text-muted-foreground">
                  {paragraph}
                </p>
              ))}
              {section.list && (
                <ul className="mt-4 grid gap-3">
                  {section.list.map((item) => (
                    <li key={item.slice(0, 40)} className="flex gap-3 leading-7 text-muted-foreground">
                      <span aria-hidden="true" className="mt-3 size-1.5 shrink-0 rounded-full bg-primary" />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          ))}
        </article>

        <div className="ion-panel mt-12 p-6 sm:p-8">
          <p className="ion-kicker">Check a record</p>
          <h2 className="ion-heading mt-3 text-2xl">Every released lot is searchable by number.</h2>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">
            Read the certificate, the testing laboratory and its own reference for the sample,
            without an account and without asking us.
          </p>
          <Link href="/documentation/lot-lookup" className="action-primary mt-5 gap-2">
            Search released lots <ArrowRight className="size-4" />
          </Link>
        </div>

        {related.length > 0 && (
          <section className="mt-12">
            <h2 className="font-display text-xl font-bold tracking-tight">More reference</h2>
            <ul className="mt-5 grid gap-4 sm:grid-cols-3">
              {related.map((other) => (
                <li key={other.slug}>
                  <Link
                    href={`/documentation/guides/${other.slug}`}
                    className="flex h-full flex-col gap-2 rounded-[1.2rem] border border-border p-5 transition-colors hover:border-primary"
                  >
                    <span className="font-semibold leading-snug">{other.title}</span>
                    <span className="text-xs leading-5 text-muted-foreground">{other.summary}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}
      </section>

      <ResearchNoticeBlock />
    </main>
  );
}
