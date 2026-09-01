import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { AlertTriangle, ArrowLeft, ArrowRight } from 'lucide-react';
import { ResearchNoticeBlock } from '@/components/site/research-notice';
import { STATUS_LABEL, getProduct, products } from '@/lib/catalog';

type PageProps = { params: Promise<{ slug: string }> };

export function generateStaticParams() {
  return products.map((product) => ({ slug: product.slug }));
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const product = getProduct(slug);
  if (!product) return { title: 'Material not found' };

  return {
    title: `${product.name} ${product.size}`,
    description: `${product.summary} Research use only. Supplied to qualified organizations by NexPhase Labs.`,
  };
}

function SpecTable({ heading, rows }: { heading: string; rows: { label: string; value: string }[] }) {
  return (
    <div>
      <h2 className="utility-label text-primary">{heading}</h2>
      <dl className="mt-5 border-t border-border">
        {rows.map((row) => (
          <div key={row.label} className="grid gap-1 border-b border-border py-4 sm:grid-cols-[220px_1fr] sm:gap-6">
            <dt className="text-sm font-semibold text-muted-foreground">{row.label}</dt>
            <dd className="break-words font-mono text-sm leading-6">{row.value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

export default async function ProductPage({ params }: PageProps) {
  const { slug } = await params;
  const product = getProduct(slug);
  if (!product) notFound();

  const related = products.filter((item) => item.area === product.area && item.slug !== product.slug).slice(0, 3);

  return (
    <main className="bg-background text-foreground">
      <div className="mx-auto max-w-[1500px] px-5 pt-8 sm:px-8 lg:px-12">
        <Link
          href="/catalog"
          className="inline-flex items-center gap-2 text-sm font-semibold text-muted-foreground transition-colors hover:text-primary"
        >
          <ArrowLeft className="size-4" />
          Back to catalog
        </Link>
      </div>

      <section className="mx-auto grid max-w-[1500px] gap-10 px-5 py-10 sm:px-8 lg:grid-cols-[1fr_1fr] lg:gap-16 lg:px-12 lg:py-14">
        <div className="relative aspect-[1.18] overflow-hidden border border-border bg-secondary">
          <div className="absolute inset-0 lab-grid opacity-50" aria-hidden="true" />
          <Image
            src={product.image}
            alt={`${product.name} research material vial`}
            fill
            priority
            className="object-cover mix-blend-multiply"
            sizes="(max-width: 1024px) 100vw, 46vw"
          />
          <span className="absolute left-5 top-5 spec-pill">{STATUS_LABEL[product.status]}</span>
        </div>

        <div className="flex flex-col justify-center">
          <p className="utility-label flex items-center gap-3 text-primary">
            <span className="h-px w-8 bg-primary" />
            {product.area}
          </p>
          <h1 className="mt-6 font-display text-[clamp(2.6rem,5vw,4.4rem)] font-extrabold leading-[0.92] tracking-[-0.06em]">
            {product.name}
          </h1>
          <p className="mt-4 font-mono text-sm text-muted-foreground">
            {product.code} &nbsp;&middot;&nbsp; {product.size} &nbsp;&middot;&nbsp; {product.form}
          </p>
          <p className="mt-7 text-lg leading-8 text-muted-foreground">{product.description}</p>

          <div className="mt-9 border border-border bg-secondary p-5">
            <p className="utility-label text-muted-foreground">Pricing &amp; availability</p>
            <p className="mt-2 leading-7">
              Shown to verified research accounts. Submit a qualification request to see current lots, quantities,
              and pricing.
            </p>
            <Link
              href="/access"
              className="mt-5 inline-flex h-11 items-center justify-center gap-3 bg-primary px-5 text-sm font-bold text-primary-foreground transition-colors hover:bg-primary/90"
            >
              Request research access <ArrowRight className="size-4" />
            </Link>
          </div>

          <div className="mt-6 flex items-start gap-4 border border-destructive/30 bg-destructive/5 p-5">
            <AlertTriangle className="mt-0.5 size-5 shrink-0 text-destructive" />
            <p className="text-sm leading-6">
              <strong className="font-semibold">Research use only.</strong> Not for human or veterinary use, not for
              clinical or diagnostic procedures, and not for consumption. NexPhase Labs does not provide dosing
              guidance or administration protocols.
            </p>
          </div>
        </div>
      </section>

      <section className="mx-auto grid max-w-[1500px] gap-14 border-t border-border px-5 py-14 sm:px-8 lg:grid-cols-2 lg:px-12">
        <SpecTable heading="Identity &amp; specification" rows={product.identity} />
        <SpecTable heading="Storage &amp; handling" rows={product.handling} />
      </section>

      <section className="mx-auto max-w-[1500px] border-t border-border px-5 py-14 sm:px-8 lg:px-12">
        <h2 className="utility-label text-primary">Documentation supplied with this material</h2>
        <ul className="mt-6 grid gap-px bg-border sm:grid-cols-2 lg:grid-cols-4">
          {product.documentation.map((item) => (
            <li key={item} className="bg-background p-6 text-sm leading-6">
              {item}
            </li>
          ))}
        </ul>
        <Link href="/documentation" className="mt-8 inline-flex items-center gap-2 text-sm font-bold text-primary">
          How our documentation works <ArrowRight className="size-4" />
        </Link>
      </section>

      {related.length > 0 && (
        <section className="mx-auto max-w-[1500px] border-t border-border px-5 py-14 sm:px-8 lg:px-12">
          <h2 className="font-display text-2xl font-extrabold tracking-[-0.04em]">Also in {product.area.toLowerCase()}</h2>
          <div
            className={`mt-8 grid gap-px bg-border ${
              related.length >= 3 ? 'sm:grid-cols-2 lg:grid-cols-3' : related.length === 2 ? 'sm:grid-cols-2' : ''
            }`}
          >
            {related.map((item) => (
              <Link key={item.slug} href={`/catalog/${item.slug}`} className="group flex items-center gap-5 bg-background p-5">
                <div className="relative size-20 shrink-0 overflow-hidden bg-secondary">
                  <Image
                    src={item.image}
                    alt={`${item.name} research material vial`}
                    fill
                    className="object-cover mix-blend-multiply"
                    sizes="80px"
                  />
                </div>
                <div>
                  <p className="font-display text-lg font-bold tracking-tight">{item.name}</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {item.size} &middot; {item.code}
                  </p>
                </div>
                <ArrowRight className="ml-auto size-5 text-primary transition-transform group-hover:translate-x-1" />
              </Link>
            ))}
          </div>
        </section>
      )}

      <ResearchNoticeBlock />
    </main>
  );
}
