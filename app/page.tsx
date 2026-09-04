import Link from 'next/link';
import {
  ArrowRight,
  ClipboardCheck,
  FileText,
  FlaskConical,
  PackageCheck,
  ShieldCheck,
  Thermometer,
} from 'lucide-react';
import { CatalogUnavailable } from '@/components/site/catalog-unavailable';
import { ProductImage } from '@/components/site/product-image';
import { ResearchNoticeBlock } from '@/components/site/research-notice';
import {
  groupByClass,
  listPublishedProducts,
  loadCatalog,
} from '@/lib/catalog-data';
import { listActiveClasses } from '@/lib/classes';

export const dynamic = 'force-dynamic';

const standards = [
  {
    title: 'Batch-visible',
    copy: 'Lot-specific documentation is kept close to the material it describes, not filed somewhere else.',
    icon: FlaskConical,
  },
  {
    title: 'Qualification-first',
    copy: 'The catalog is designed for verified organizations and laboratory teams, and access is reviewed.',
    icon: ShieldCheck,
  },
  {
    title: 'Human support',
    copy: 'Questions reach a person who can locate the right record and respond clearly.',
    icon: ArrowRight,
  },
];

const accessSteps = [
  {
    step: '01',
    title: 'Submit a qualification request',
    copy: 'Tell us the organization, the research context, and who will take receipt of material. Creating a login does not enable purchasing.',
    icon: ClipboardCheck,
  },
  {
    step: '02',
    title: 'We review and confirm',
    copy: 'A person reviews the request against our research-use policy. Approval enables pricing and ordering; your account shows the review status.',
    icon: ShieldCheck,
  },
  {
    step: '03',
    title: 'Order with documentation attached',
    copy: 'Choose materials after approval. Follow payment, shipment, and available lot documentation from your order.',
    icon: PackageCheck,
  },
];

const documentationHighlights = [
  {
    icon: FileText,
    label: 'Certificate of analysis',
    detail: 'Issued per lot, not per product line.',
  },
  {
    icon: FlaskConical,
    label: 'HPLC chromatogram',
    detail: 'The actual trace for the lot you receive.',
  },
  {
    icon: Thermometer,
    label: 'Storage and handling sheet',
    detail: 'Written for the receiving laboratory.',
  },
];

export default async function Home() {
  const catalog = await loadCatalog(async () => ({
    products: await listPublishedProducts(),
    classes: await listActiveClasses(),
  }));
  const all = catalog.data?.products ?? [];
  const classes = catalog.data?.classes ?? [];
  const featured = all.filter((p) => p.featured);
  const hero = featured[0] ?? null;
  const byClass = groupByClass(all);

  return (
    <main className="overflow-hidden bg-background text-foreground">
      {/* Hero */}
      <section className="mx-auto grid max-w-[1500px] gap-8 px-5 py-10 sm:px-8 lg:grid-cols-[1fr_1fr] lg:gap-14 lg:px-12 lg:py-14">
        <div className="flex flex-col justify-center py-6 lg:py-10">
          <div>
            <p className="utility-label mb-8 flex items-center gap-3 text-primary">
              <span className="h-px w-8 bg-primary" />
              Independent research materials &middot; USA
            </p>
            <h1 className="max-w-2xl font-display text-[clamp(2.7rem,5.2vw,5.2rem)] font-semibold leading-[1.06] tracking-[-0.045em]">
              Research materials. Clearly documented.
            </h1>
            <p className="mt-9 max-w-xl text-lg leading-8 text-muted-foreground sm:text-xl">
              Chemical identity, lot records, and research access in one place.
              Materials supplied to qualified laboratory organizations.
            </p>
          </div>
          <div className="mt-12 flex flex-col gap-4 sm:flex-row">
            <Link
              href="/catalog"
              className="inline-flex h-12 items-center justify-center gap-3 bg-primary px-6 text-sm font-bold text-primary-foreground transition-colors hover:bg-primary/90"
            >
              Explore the catalog <ArrowRight className="size-4" />
            </Link>
            <Link
              href="/access"
              className="inline-flex h-12 items-center justify-center border border-foreground/20 px-6 text-sm font-bold transition-colors hover:border-primary hover:text-primary"
            >
              Request research access
            </Link>
          </div>
        </div>

        <div className="relative min-h-[430px] overflow-hidden rounded-xl bg-secondary lg:min-h-[560px]">
          {!hero && (
            <div className="flex min-h-[430px] items-center justify-center p-8 text-center text-muted-foreground">
              Browse chemical specifications and available lot records in the
              catalog.
            </div>
          )}
          {hero && (
            <>
              <ProductImage
                code={hero.code}
                name={hero.name}
                image={hero.image}
                priority
                imageClassName="object-contain pb-28 pt-4"
                sizes="(max-width: 1024px) 100vw, 46vw"
              />
              <div className="absolute bottom-0 left-0 right-0 z-10 grid grid-cols-[1fr_auto] border-t border-border bg-background/92 p-5 backdrop-blur sm:p-7">
                <div>
                  <p className="utility-label text-muted-foreground">
                    Reference photograph
                  </p>
                  <p className="mt-1 font-display text-2xl font-bold tracking-tight">
                    {hero.name}
                  </p>
                </div>
                <Link
                  href={`/catalog/${hero.slug}`}
                  className="self-end text-sm font-semibold text-primary"
                >
                  View material
                </Link>
              </div>
            </>
          )}
        </div>
      </section>

      {/* Standards */}
      <section
        id="standards"
        className="mx-auto grid max-w-[1500px] border-b border-border sm:grid-cols-3"
      >
        {standards.map(({ title, copy, icon: Icon }) => (
          <article
            key={title}
            className="border-b border-border p-7 last:border-b-0 sm:border-b-0 sm:border-r sm:last:border-r-0 lg:p-9"
          >
            <div className="mb-5 flex items-center justify-between">
              <Icon className="size-5 text-primary" />
            </div>
            <h2 className="font-display text-xl font-bold">{title}</h2>
            <p className="mt-3 max-w-sm leading-7 text-muted-foreground">
              {copy}
            </p>
          </article>
        ))}
      </section>

      {/* Featured catalog */}
      <section
        id="catalog"
        className="mx-auto max-w-[1500px] px-5 py-16 sm:px-8 lg:px-12 lg:py-24"
      >
        <div className="mb-10 flex flex-wrap items-end justify-between gap-6">
          <div>
            <p className="utility-label text-primary">Selected catalog</p>
            <h2 className="mt-3 font-display text-3xl font-semibold tracking-tight sm:text-4xl">
              Explore the catalog.
            </h2>
          </div>
          <Link
            href="/catalog"
            className="flex items-center gap-2 text-sm font-bold text-primary"
          >
            View the full catalog <ArrowRight className="size-4" />
          </Link>
        </div>
        {catalog.unavailable && <CatalogUnavailable compact />}
        <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
          {featured.map((product) => (
            <Link
              key={product.code}
              href={`/catalog/${product.slug}`}
              className="group overflow-hidden rounded-lg bg-background"
            >
              <div className="relative aspect-[1.18] overflow-hidden bg-secondary">
                <ProductImage
                  code={product.code}
                  name={product.name}
                  image={product.image}
                  imageClassName="transition-transform duration-500 group-hover:scale-[1.025]"
                  sizes="(max-width: 640px) 100vw, 33vw"
                />
                <span className="absolute right-4 top-4 bg-background px-2 py-1 font-mono text-[10px] text-muted-foreground">
                  {product.code}
                </span>
              </div>
              <div className="flex items-end justify-between gap-4 py-5">
                <div>
                  <h3 className="font-display text-2xl font-bold tracking-tight">
                    {product.name}
                  </h3>
                  <p className="mt-1 text-sm text-muted-foreground">
                    CAS {product.casNumber} &middot; {product.form}
                  </p>
                </div>
                <ArrowRight className="mb-1 size-5 text-primary transition-transform group-hover:translate-x-1" />
              </div>
            </Link>
          ))}
        </div>
      </section>

      {/* Research areas */}
      <section className="border-y border-border bg-secondary px-5 py-16 sm:px-8 lg:px-12 lg:py-20">
        <div className="mx-auto max-w-[1404px]">
          <p className="utility-label text-primary">Browse by chemical class</p>
          <h2 className="mt-3 max-w-2xl font-display text-3xl font-extrabold tracking-[-0.04em] sm:text-4xl">
            Browse by chemical identity.
          </h2>
          <div className="mt-10 grid gap-px bg-border sm:grid-cols-2 lg:grid-cols-3">
            {classes.map((area) => {
              const count = byClass.get(area.name)?.length ?? 0;
              return (
                <Link
                  key={area.id}
                  href={`/catalog#${area.id}`}
                  className="group flex flex-col justify-between gap-8 bg-background p-7 transition-colors hover:bg-accent"
                >
                  <span className="font-mono text-[11px] text-muted-foreground">
                    {count} {count === 1 ? 'material' : 'materials'}
                  </span>
                  <span className="flex items-end justify-between gap-3">
                    <span className="font-display text-xl font-bold leading-tight tracking-tight">
                      {area.name}
                    </span>
                    <ArrowRight className="size-5 shrink-0 text-primary transition-transform group-hover:translate-x-1" />
                  </span>
                </Link>
              );
            })}
          </div>
        </div>
      </section>

      {/* How access works */}
      <section className="mx-auto max-w-[1500px] px-5 py-16 sm:px-8 lg:px-12 lg:py-24">
        <div className="mb-12 max-w-2xl">
          <p className="utility-label text-primary">How access works</p>
          <h2 className="mt-3 font-display text-4xl font-extrabold tracking-[-0.045em] sm:text-5xl">
            Three steps, reviewed by a person.
          </h2>
          <p className="mt-5 leading-8 text-muted-foreground">
            NexPhase Labs does not sell to the general public. Ordering is
            opened to organizations that qualify under our research-use policy.
          </p>
        </div>
        <ol className="grid gap-px bg-border lg:grid-cols-3">
          {accessSteps.map(({ step, title, copy, icon: Icon }) => (
            <li key={step} className="bg-background p-7 lg:p-9">
              <div className="mb-5 flex items-center justify-between">
                <Icon className="size-5 text-primary" />
                <span className="font-mono text-[11px] text-muted-foreground">
                  {step}
                </span>
              </div>
              <h3 className="font-display text-xl font-bold">{title}</h3>
              <p className="mt-3 leading-7 text-muted-foreground">{copy}</p>
            </li>
          ))}
        </ol>
        <Link
          href="/access"
          className="mt-10 inline-flex h-12 items-center justify-center gap-3 bg-primary px-6 text-sm font-bold text-primary-foreground transition-colors hover:bg-primary/90"
        >
          Start a qualification request <ArrowRight className="size-4" />
        </Link>
      </section>

      {/* Documentation */}
      <section className="border-t border-border px-5 py-16 sm:px-8 lg:px-12 lg:py-20">
        <div className="mx-auto grid max-w-[1404px] gap-12 lg:grid-cols-[1fr_1fr] lg:items-center">
          <div>
            <p className="utility-label text-primary">Lot documentation</p>
            <h2 className="mt-3 font-display text-3xl font-extrabold tracking-[-0.04em] sm:text-4xl">
              Documentation that matches the vial in your hand.
            </h2>
            <p className="mt-5 leading-8 text-muted-foreground">
              A certificate that describes a product line tells you very little.
              Ours describes the lot. If the paperwork and the label do not
              agree, we would rather you find out from us first.
            </p>
            <Link
              href="/documentation"
              className="mt-7 inline-flex items-center gap-2 text-sm font-bold text-primary"
            >
              See what a COA includes <ArrowRight className="size-4" />
            </Link>
          </div>
          <ul className="grid gap-px bg-border">
            {documentationHighlights.map(({ icon: Icon, label, detail }) => (
              <li
                key={label}
                className="flex items-start gap-5 bg-background p-6"
              >
                <Icon className="mt-0.5 size-5 shrink-0 text-primary" />
                <div>
                  <p className="font-display text-lg font-bold tracking-tight">
                    {label}
                  </p>
                  <p className="mt-1 text-sm leading-6 text-muted-foreground">
                    {detail}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <ResearchNoticeBlock />
    </main>
  );
}
