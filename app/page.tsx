import Link from 'next/link';
import {
  ArrowRight,
  CheckCircle2,
  ClipboardCheck,
  FileCheck2,
  FileText,
  FlaskConical,
  Headphones,
  Microscope,
  PackageCheck,
  Search,
  ScanSearch,
  ShieldCheck,
  Thermometer,
  Timer,
} from 'lucide-react';
import { openCheckoutEnabled } from '@/lib/site-config';
import { CatalogUnavailable } from '@/components/site/catalog-unavailable';
import { ProductImage } from '@/components/site/product-image';
import { ResearchNoticeBlock } from '@/components/site/research-notice';
import { groupByClass, loadCatalog } from '@/lib/catalog-data';
import { SHIPPING_CUTOFF } from '@/lib/policy';
import { listStorefrontProducts } from '@/lib/storefront';
import { listActiveClasses } from '@/lib/classes';
import { currentViewer } from '@/lib/visibility';
import { formatCents, priceFor } from '@/lib/visibility-rules';

export const dynamic = 'force-dynamic';

// Four promises a buyer can hold us to (Chapter 19 §19.2) — each one is a
// mechanism that exists in this code, not an adjective. The cut-off hour is
// the same constant the shipping policy prints.
const promises = [
  { label: `Same-day dispatch before ${SHIPPING_CUTOFF}`, icon: Timer },
  { label: 'Third-party tested, lab named on every certificate', icon: Microscope },
  { label: 'Purity stated on every certificate', icon: FileCheck2 },
  { label: 'Documents pinned to your order', icon: ScanSearch },
];

const documentationHighlights = [
  {
    icon: FileText,
    label: 'Certificate of analysis',
    detail: 'Issued per released lot, not as a generic product-line document.',
  },
  {
    icon: FlaskConical,
    label: 'Analytical trace',
    detail: 'HPLC and mass data stay connected to the material they describe.',
  },
  {
    icon: Thermometer,
    label: 'Handling record',
    detail: 'Storage and laboratory handling information presented clearly.',
  },
  {
    icon: ScanSearch,
    label: 'Quality release review',
    detail: 'Documentation is reviewed before a lot is shown as released.',
  },
];

const confidencePoints = [
  ['Lot-level traceability', 'The catalog, analytical record, and order history point to the released lot.'],
  ['Clear material identity', 'Catalog number, CAS, form, and pack presentation stay easy to compare.'],
  ['Documentation first', 'Available COAs and safety records are part of the buying journey, not an afterthought.'],
  ['Human order support', 'Questions about catalog records or an order go to a real support channel.'],
] as const;

export default async function Home() {
  const open = openCheckoutEnabled();
  const catalog = await loadCatalog(async () => ({
    products: await listStorefrontProducts(),
    classes: await listActiveClasses(),
  }));
  const all = catalog.data?.products ?? [];
  const classes = catalog.data?.classes ?? [];
  // Featured means listed AND flagged; a flagged product that is not sellable
  // is not shown, and the grid is filled from the rest of the listed catalog.
  const flagged = all.filter((product) => product.featured);
  const featured = [...flagged, ...all.filter((product) => !product.featured)].slice(0, 4);
  const hero = featured[0] ?? null;
  const byClass = groupByClass(all);
  const { visibility } = await currentViewer();
  const process = open
    ? [
        {
          title: 'Find the material',
          copy: 'Search by compound, catalog number, or CAS and review the complete specification.',
          icon: Search,
        },
        {
          title: 'Review the lot record',
          copy: 'See the available documentation and pack sizes before placing the order.',
          icon: ClipboardCheck,
        },
        {
          title: 'Check out clearly',
          copy: 'Enter delivery details, choose shipping, and follow the order from payment to arrival.',
          icon: PackageCheck,
        },
      ]
    : [
        {
          title: 'Create a research account',
          copy: 'Tell us who will receive the material and the organization conducting the work.',
          icon: ClipboardCheck,
        },
        {
          title: 'Complete review',
          copy: 'A person reviews the account against our research-use conditions.',
          icon: ShieldCheck,
        },
        {
          title: 'Order with records attached',
          copy: 'Approved buyers see pricing, availability, and lot documentation in one place.',
          icon: PackageCheck,
        },
      ];

  return (
    <main className="overflow-hidden text-foreground">
      <section className="mx-auto max-w-[1280px] px-4 pb-5 pt-2 sm:px-6">
        <div className="ion-hero grid min-h-[630px] items-stretch lg:grid-cols-[0.95fr_1.05fr]">
          <div className="flex flex-col justify-center px-7 py-14 sm:px-12 lg:px-16">
            <p className="w-fit rounded-full border border-white/20 bg-white/10 px-4 py-2 text-xs font-extrabold tracking-[0.04em]">
              Research use only · documented by lot
            </p>
            <h1 className="mt-7 max-w-xl font-display text-[clamp(3rem,5.2vw,5.25rem)] font-extrabold leading-[0.96] tracking-[-0.065em]">
              Research peptides. Verified by lot.
            </h1>
            <p className="mt-7 max-w-xl text-lg leading-8 text-white/76">
              A focused catalog of research materials with clear specifications,
              released-lot records, and a straightforward path from product to order.
            </p>
            <div className="mt-9 flex flex-wrap gap-3">
              <Link
                href="/catalog"
                className="inline-flex min-h-12 items-center gap-2 rounded-full bg-white px-6 text-sm font-extrabold text-[var(--ion-navy)] shadow-xl transition-transform hover:-translate-y-0.5"
              >
                Shop products <ArrowRight className="size-4" />
              </Link>
              <Link
                href="/documentation"
                className="inline-flex min-h-12 items-center rounded-full border border-white/30 px-6 text-sm font-bold text-white hover:bg-white/10"
              >
                View COAs
              </Link>
            </div>
          </div>

          <div className="relative flex min-h-[430px] items-center justify-center p-7 lg:p-12">
            <div className="absolute inset-x-[12%] bottom-[12%] h-20 rounded-full bg-blue-300/35 blur-3xl" />
            {hero ? (
              <Link
                href={`/catalog/${hero.slug}`}
                className="group relative block aspect-[1.08] w-full max-w-[620px] overflow-hidden rounded-[2rem] border border-white/20 bg-white/95 shadow-[0_35px_70px_rgba(0,0,55,0.35)]"
              >
                <ProductImage
                  code={hero.code}
                  name={hero.name}
                  image={hero.image}
                  priority
                  imageClassName="object-contain p-5 transition-transform duration-500 group-hover:scale-[1.02]"
                  sizes="(max-width: 1024px) 90vw, 48vw"
                />
                <span className="absolute bottom-5 left-5 right-5 flex items-center justify-between rounded-2xl bg-white/92 px-5 py-4 text-[var(--ion-navy)] shadow-lg backdrop-blur">
                  <span>
                    <span className="block text-xs font-bold text-[var(--ion-blue)]">
                      Featured product
                    </span>
                    <span className="mt-1 block font-display text-xl font-extrabold">
                      {hero.name}
                    </span>
                  </span>
                  <ArrowRight className="size-5 transition-transform group-hover:translate-x-1" />
                </span>
              </Link>
            ) : (
              <div className="rounded-[2rem] border border-white/20 bg-white/10 p-10 text-center text-white/70">
                Catalog materials will appear here when published.
              </div>
            )}
          </div>
          <div className="grid border-t border-white/15 bg-white/5 sm:grid-cols-2 lg:col-span-2 lg:grid-cols-4">
            {promises.map(({ label, icon: Icon }) => (
              <div key={label} className="flex items-center gap-3 border-b border-white/10 px-6 py-5 last:border-0 sm:border-r lg:border-b-0">
                <span className="grid size-8 place-items-center rounded-full bg-white text-primary"><Icon className="size-4" /></span>
                <span className="font-display text-sm font-extrabold text-white">{label}</span>
              </div>
            ))}
          </div>
        </div>
      </section>


      <section className="mx-auto grid max-w-[1280px] gap-5 px-4 py-16 sm:px-6 lg:grid-cols-2">
        <article className="ion-panel p-8 sm:p-11">
          <span className="ion-kicker">Research products ready to explore</span>
          <h2 className="ion-heading mt-6 text-4xl sm:text-5xl">
            Find the material your work calls for.
          </h2>
          <p className="mt-6 max-w-xl text-lg leading-8 text-muted-foreground">
            Browse by compound or chemical class, compare pack sizes, and review
            the identity and handling record before you add anything to your cart.
          </p>
          <Link href="/catalog" className="action-primary mt-8 gap-2">
            View all products <ArrowRight className="size-4" />
          </Link>
        </article>
        {/* `!` is required: the unlayered .ion-panel rule sets a white background that
            otherwise beats Tailwind's layered utilities, leaving white text on white. */}
        <article className="ion-panel overflow-hidden bg-[var(--ion-navy)]! p-8 text-white sm:p-11">
          <span className="inline-flex rounded-full bg-white/10 px-3 py-2 text-xs font-bold text-blue-200">
            Released-lot documentation
          </span>
          <h2 className="mt-6 max-w-lg font-display text-4xl font-extrabold leading-[1.02] tracking-[-0.055em] sm:text-5xl">
            Confidence should come with the vial.
          </h2>
          <p className="mt-6 max-w-xl text-lg leading-8 text-white/68">
            Every released lot keeps its analytical results, storage details,
            manufacturer record, and order documents connected from catalog to delivery.
          </p>
          <Link
            href="/documentation"
            className="mt-8 inline-flex min-h-11 items-center gap-2 rounded-full bg-white px-6 text-sm font-extrabold text-[var(--ion-navy)]"
          >
            Explore lab results <ArrowRight className="size-4" />
          </Link>
        </article>
      </section>

      <section className="mx-auto max-w-[1280px] px-4 pb-20 sm:px-6">
        <div className="mb-9 flex flex-wrap items-end justify-between gap-6">
          <div>
            <span className="ion-kicker">Featured research products</span>
            <h2 className="ion-heading mt-5 text-4xl sm:text-5xl">
              Start with the essentials.
            </h2>
          </div>
          <Link href="/catalog" className="action-secondary gap-2">
            Shop all products <ArrowRight className="size-4" />
          </Link>
        </div>
        {catalog.unavailable && <CatalogUnavailable compact />}
        <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
          {featured.map((product) => (
            <Link
              key={product.code}
              href={`/catalog/${product.slug}`}
              className="ion-panel group flex flex-col p-4"
            >
              <div className="relative aspect-[1.12] overflow-hidden rounded-[1.4rem] bg-secondary">
                <ProductImage
                  code={product.code}
                  name={product.name}
                  image={product.image}
                  imageClassName="transition-transform duration-500 group-hover:scale-[1.025]"
                  sizes="(max-width: 768px) 100vw, 33vw"
                />
                {product.stock === 'out_of_stock' && (
                  <span className="absolute right-3 top-3 rounded-full bg-[var(--ion-navy)] px-3 py-1.5 text-[10px] font-extrabold text-white shadow-sm">
                    Out of stock
                  </span>
                )}
              </div>
              <div className="flex flex-1 items-end justify-between gap-4 px-3 pb-3 pt-6">
                <div>
                  <p className="text-xs font-bold text-primary">{product.code}</p>
                  <h3 className="mt-2 font-display text-2xl font-extrabold tracking-tight text-[var(--ion-navy)]">
                    {product.name}
                  </h3>
                  <p className="mt-2 text-sm text-muted-foreground">
                    CAS {product.casNumber} · {product.form}
                  </p>
                  <p className="mt-3 text-xs font-bold uppercase tracking-[0.08em] text-muted-foreground">Research use only</p>
                  {visibility.pricing !== 'none' && (() => {
                    const prices = product.variants
                      .filter((variant) => variant.active)
                      .map((variant) => priceFor(variant, visibility.pricing))
                      .filter((price): price is number => price !== null);
                    if (!prices.length) return null;
                    const min = Math.min(...prices);
                    const max = Math.max(...prices);
                    return <p className="mt-3 font-display text-lg font-extrabold text-[var(--ion-navy)]">{min === max ? formatCents(min) : `${formatCents(min)} – ${formatCents(max)}`}</p>;
                  })()}
                </div>
                <span className="grid size-10 shrink-0 place-items-center rounded-full bg-primary text-white">
                  <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
                </span>
              </div>
            </Link>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-[1280px] px-4 pb-20 sm:px-6">
        <div className="grid gap-8 rounded-[2rem] bg-[var(--ion-navy)] p-8 text-white sm:p-11 lg:grid-cols-[0.9fr_1.1fr] lg:items-center">
          <div>
            <span className="inline-flex rounded-full bg-white/10 px-3 py-2 text-xs font-bold text-blue-200">Trusted research supply</span>
            <h2 className="mt-6 max-w-xl font-display text-4xl font-extrabold leading-[1.02] tracking-[-0.055em] sm:text-5xl">NexPhase confidence is built into the record.</h2>
            <p className="mt-6 max-w-xl text-lg leading-8 text-white/68">A storefront designed around the information a research buyer needs to identify material, inspect released-lot records, and follow an order clearly.</p>
            <Link href="/about" className="mt-8 inline-flex min-h-11 items-center gap-2 rounded-full bg-white px-6 text-sm font-extrabold text-[var(--ion-navy)]">Why NexPhase <ArrowRight className="size-4" /></Link>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {confidencePoints.map(([title, copy]) => (
              <article key={title} className="rounded-[1.4rem] border border-white/14 bg-white/10 p-5">
                <CheckCircle2 className="size-5 text-blue-200" />
                <h3 className="mt-5 font-display text-lg font-extrabold">{title}</h3>
                <p className="mt-2 text-sm leading-6 text-white/65">{copy}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-[1280px] px-4 pb-20 sm:px-6">
        <div className="ion-panel p-7 sm:p-11">
          <div className="grid gap-10 lg:grid-cols-[0.8fr_1.2fr]">
            <div>
              <span className="ion-kicker">How it works</span>
              <h2 className="ion-heading mt-5 text-4xl sm:text-5xl">
              From catalog to your receiving bench.
              </h2>
              <p className="mt-5 leading-7 text-muted-foreground">
                A simple path that keeps research-use conditions and material
                records visible at every step.
              </p>
            </div>
            <ol className="grid gap-4 md:grid-cols-3">
              {process.map(({ title, copy, icon: Icon }, index) => (
                <li key={title} className="rounded-[1.4rem] bg-secondary p-6">
                  <div className="flex items-center justify-between">
                    <Icon className="size-5 text-primary" />
                    <span className="font-display text-sm font-extrabold text-primary">
                      0{index + 1}
                    </span>
                  </div>
                  <h3 className="mt-8 font-display text-xl font-extrabold text-[var(--ion-navy)]">
                    {title}
                  </h3>
                  <p className="mt-3 text-sm leading-6 text-muted-foreground">
                    {copy}
                  </p>
                </li>
              ))}
            </ol>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-[1280px] px-4 pb-20 sm:px-6">
        <div className="ion-hero grid gap-10 p-8 sm:p-12 lg:grid-cols-[1fr_0.95fr] lg:p-16">
          <div>
            <span className="inline-flex rounded-full bg-white/10 px-3 py-2 text-xs font-bold text-blue-200">
              NexPhase quality assurance
            </span>
            <h2 className="mt-6 max-w-xl font-display text-4xl font-extrabold leading-[1.02] tracking-[-0.055em] sm:text-5xl">
              Verified batch documentation.
            </h2>
            <p className="mt-6 max-w-xl text-lg leading-8 text-white/68">
              Search a lot, inspect the available analytical files, and keep the
              exact record connected to the material your laboratory receives.
            </p>
            <Link
              href="/documentation"
              className="mt-8 inline-flex min-h-11 items-center gap-2 rounded-full bg-white px-6 text-sm font-extrabold text-[var(--ion-navy)]"
            >
              Search COAs <ArrowRight className="size-4" />
            </Link>
          </div>
          <ul className="grid gap-3">
            {documentationHighlights.map(({ icon: Icon, label, detail }) => (
              <li
                key={label}
                className="flex gap-4 rounded-[1.4rem] border border-white/14 bg-white/10 p-5 backdrop-blur"
              >
                <span className="grid size-10 shrink-0 place-items-center rounded-full bg-white text-primary">
                  <Icon className="size-5" />
                </span>
                <span>
                  <span className="block font-display text-lg font-extrabold">
                    {label}
                  </span>
                  <span className="mt-1 block text-sm leading-6 text-white/65">
                    {detail}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="mx-auto max-w-[1280px] px-4 pb-20 sm:px-6">
        <div className="ion-panel grid gap-8 overflow-hidden p-8 sm:p-11 lg:grid-cols-[1fr_0.8fr] lg:items-center">
          <div>
            <span className="ion-kicker">A real team is here to help</span>
            <h2 className="ion-heading mt-5 text-4xl">
              Questions about an order or record?
            </h2>
            <p className="mt-5 max-w-xl text-lg leading-8 text-muted-foreground">Use the on-page support button for a conversation, or send the team the relevant catalog number, lot number, or order number.</p>
            <div className="mt-7 flex flex-wrap gap-3">
              <Link href="/contact" className="action-primary gap-2">Contact NexPhase <ArrowRight className="size-4" /></Link>
              <Link href="/faq" className="action-secondary">Browse FAQs</Link>
            </div>
          </div>
          <div className="rounded-[1.5rem] bg-secondary p-6">
            <Headphones className="size-7 text-primary" />
            <p className="mt-5 font-display text-2xl font-extrabold text-[var(--ion-navy)]">Product, lot, and order support</p>
            <p className="mt-3 text-sm leading-6 text-muted-foreground">We can help locate a document, explain account access, or resolve an order issue. We do not provide medical or experimental-use guidance.</p>
          </div>
        </div>
      </section>

      {classes.length > 0 && (
        <nav className="sr-only" aria-label="Chemical classes">
          {classes.map((area) => (
            <Link key={area.id} href={`/catalog?class=${encodeURIComponent(area.name)}#catalog-search`}>
              {area.name} ({byClass.get(area.name)?.length ?? 0})
            </Link>
          ))}
        </nav>
      )}
      <ResearchNoticeBlock />
    </main>
  );
}
