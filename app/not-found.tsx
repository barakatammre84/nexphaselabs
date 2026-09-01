import Link from 'next/link';
import { ArrowRight } from 'lucide-react';

export default function NotFound() {
  return (
    <main className="bg-background text-foreground">
      <section className="mx-auto max-w-[900px] px-5 py-24 sm:px-8 lg:py-32">
        <p className="utility-label text-primary">404</p>
        <h1 className="mt-5 font-display text-[clamp(2.2rem,4.2vw,3.6rem)] font-extrabold leading-[0.95] tracking-[-0.05em]">
          That page is not in the catalog.
        </h1>
        <p className="mt-6 max-w-xl text-lg leading-8 text-muted-foreground">
          The link may be out of date, or the material may have been withdrawn from the catalog.
        </p>
        <div className="mt-9 flex flex-col gap-4 sm:flex-row">
          <Link
            href="/catalog"
            className="inline-flex h-12 items-center justify-center gap-3 bg-primary px-6 text-sm font-bold text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Browse the catalog <ArrowRight className="size-4" />
          </Link>
          <Link
            href="/"
            className="inline-flex h-12 items-center justify-center border border-foreground/20 px-6 text-sm font-bold transition-colors hover:border-primary hover:text-primary"
          >
            Back to home
          </Link>
        </div>
      </section>
    </main>
  );
}
