import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, FileText, Lock } from 'lucide-react';
import { CatalogUnavailable } from '@/components/site/catalog-unavailable';
import { ProductImage } from '@/components/site/product-image';
import { ResearchNoticeBlock } from '@/components/site/research-notice';
import {
  REGULATORY_STATEMENT,
  STANDARD_DOCUMENTATION,
  STATUS_LABEL,
} from '@/lib/catalog';
import {
  getPublishedProduct,
  listPublishedProducts,
  loadCatalog,
} from '@/lib/catalog-data';
import { listReleasedLotsForProduct } from '@/lib/lots-public';
import { currentSds } from '@/lib/product-documents';
import { currentViewer } from '@/lib/visibility';
import { formatCents, priceFor } from '@/lib/visibility-rules';

export const dynamic = 'force-dynamic';

/**
 * Product page.
 *
 * Structure follows the reagent-supplier convention (Cayman, Tocris, Bachem):
 * chemical identity first, documentation second, commercial terms third.
 *
 * Three rules here are load-bearing. Do not "improve" them later:
 *
 *  1. The regulatory statement renders ABOVE THE FOLD, in the body. A footer
 *     disclaimer sitting beneath a body claim is the exact fact pattern FDA
 *     relies on in every peptide warning letter reviewed.
 *  2. No link from this page to any article, blog post or literature summary.
 *     Adjacency between a write-up and an order button is the theory of the
 *     case in those letters.
 *  3. Nothing on this page describes what the compound does in an organism.
 *     No dose, no route, no reconstitution volume, no benefit, no indication.
 */

type PageProps = {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ cart?: string; why?: string }>;
};

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const loaded = await loadCatalog(() => getPublishedProduct(slug));
  const product = loaded.data;
  if (!product)
    return {
      title: loaded.unavailable ? 'Catalog unavailable' : 'Material not found',
    };

  return {
    title: `${product.name} — ${product.code}`,
    description: `${product.name}, CAS ${product.casNumber}, ${product.purity}. Supplied to qualified research organizations for laboratory use only.`,
  };
}

function SpecRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid gap-1 border-b border-border py-4 sm:grid-cols-[220px_1fr] sm:gap-6">
      <dt className="text-sm font-semibold text-muted-foreground">{label}</dt>
      <dd className="break-words font-mono text-sm leading-6">{value}</dd>
    </div>
  );
}

export default async function ProductPage({ params, searchParams }: PageProps) {
  const { slug } = await params;
  const { cart: cartFlag, why } = await searchParams;
  const loaded = await loadCatalog(() => getPublishedProduct(slug));

  if (loaded.unavailable) {
    return (
      <main className="bg-background text-foreground">
        <section className="mx-auto max-w-[1500px] px-5 py-14 sm:px-8 lg:px-12">
          <CatalogUnavailable />
        </section>
      </main>
    );
  }

  const product = loaded.data;
  // Drafts and withdrawn products 404 here exactly like an unknown slug.
  if (!product) notFound();

  const siblings = await loadCatalog(listPublishedProducts);
  const related = (siblings.data ?? [])
    .filter(
      (item) =>
        item.chemicalClass === product.chemicalClass &&
        item.slug !== product.slug,
    )
    .slice(0, 3);

  // Tier-aware visibility: one rule, evaluated here, decides whether prices
  // and released lots render. Anonymous and unverified visitors see neither.
  const { account, visibility } = await currentViewer();
  const releasedLots = visibility.availability
    ? ((await loadCatalog(() => listReleasedLotsForProduct(product.code)))
        .data ?? [])
    : [];
  const activeVariants = product.variants.filter((v) => v.active);
  const sds = (await loadCatalog(() => currentSds(product.id))).data ?? null;

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

      {/* ---------- Identity header ---------- */}
      <section className="mx-auto max-w-[1500px] border-b border-border px-5 py-10 sm:px-8 lg:px-12">
        <div className="grid gap-10 lg:grid-cols-[1fr_20rem] lg:gap-16">
          <div>
            <p className="utility-label text-primary">
              {product.code} &middot; {product.chemicalClass}
            </p>
            <h1 className="mt-5 font-display text-[clamp(2.2rem,4.5vw,3.6rem)] font-extrabold leading-[0.96] tracking-[-0.05em]">
              {product.name}
            </h1>
            {/* Rule 1 — conditions of supply, in the body, above the fold. */}
            <div className="mt-5 max-w-2xl border-l-2 border-primary bg-secondary px-4 py-3">
              <p className="utility-label text-primary">Conditions of supply</p>
              <p className="mt-2 text-sm font-semibold leading-6">
                {REGULATORY_STATEMENT}
              </p>
            </div>
            <p className="mt-5 max-w-2xl font-mono text-sm leading-relaxed text-muted-foreground">
              {product.formalName}
            </p>
            {product.synonyms.length > 0 && (
              <p className="mt-3 max-w-2xl text-sm text-muted-foreground">
                Synonyms: {product.synonyms.join('; ')}
              </p>
            )}

            <p className="mt-7 max-w-2xl leading-8 text-muted-foreground">
              {product.description}
            </p>
          </div>

          <div className="relative aspect-square overflow-hidden rounded-xl bg-secondary">
            <ProductImage
              code={product.code}
              name={product.name}
              image={product.image}
              sizes="(max-width: 1024px) 100vw, 20rem"
            />
          </div>
        </div>
      </section>

      <nav
        aria-label="Material sections"
        className="mx-auto flex max-w-[1500px] flex-wrap gap-3 px-5 py-5 sm:px-8 lg:px-12"
      >
        <a href="#material-identity" className="action-secondary">
          Specifications
        </a>
        <a href="#material-documents" className="action-secondary">
          Documents
        </a>
        <a href="#material-packs" className="action-primary">
          Pack sizes & ordering
        </a>
      </nav>
      {/* ---------- Chemical identity ---------- */}
      <section className="mx-auto max-w-[1500px] border-b border-border px-5 py-14 sm:px-8 lg:px-12">
        <h2
          id="material-identity"
          className="font-display text-xl font-semibold"
        >
          Chemical identity
        </h2>
        <dl className="mt-5 max-w-4xl border-t border-border">
          <SpecRow label="CAS number" value={product.casNumber} />
          {product.relatedCas?.map((r) => (
            <SpecRow key={r.cas} label={`CAS — ${r.form}`} value={r.cas} />
          ))}
          {product.sequenceOneLetter && (
            <SpecRow
              label="Sequence (one-letter)"
              value={product.sequenceOneLetter}
            />
          )}
          {product.sequenceThreeLetter && (
            <SpecRow
              label="Sequence (three-letter)"
              value={product.sequenceThreeLetter}
            />
          )}
          <SpecRow label="Molecular formula" value={product.molecularFormula} />
          <SpecRow label="Molecular weight" value={product.molecularWeight} />
          {product.exactMass && (
            <SpecRow label="Exact mass" value={product.exactMass} />
          )}
          {product.inchiKey && (
            <SpecRow label="InChI Key" value={product.inchiKey} />
          )}
          {product.smiles && <SpecRow label="SMILES" value={product.smiles} />}
          {product.pubchemCid && (
            <SpecRow label="PubChem CID" value={product.pubchemCid} />
          )}
        </dl>
      </section>

      {/* ---------- Specification and handling ---------- */}
      <section className="mx-auto max-w-[1500px] border-b border-border px-5 py-14 sm:px-8 lg:px-12">
        <div className="grid gap-12 lg:grid-cols-2">
          <div>
            <h2 className="utility-label text-primary">Specification</h2>
            <dl className="mt-5 border-t border-border">
              <SpecRow label="Purity" value={product.purity} />
              <SpecRow label="Physical form" value={product.form} />
              <SpecRow label="Salt / counter-ion" value={product.saltForm} />
            </dl>
          </div>

          <div>
            <h2 className="utility-label text-primary">Handling and storage</h2>
            <dl className="mt-5 border-t border-border">
              <SpecRow label="Storage (solid)" value={product.storageSolid} />
              <SpecRow
                label="Storage (stock solution)"
                value={product.storageStock}
              />
              <SpecRow label="Stability" value={product.stability} />
              <SpecRow label="Shipping condition" value={product.shipping} />
            </dl>

            {/*
              Laboratory solvents only. Never a reconstitution volume, never
              bacteriostatic water, never a syringe conversion.
            */}
            {product.solubility.length > 0 && (
              <div className="mt-9">
                <h3 className="utility-label text-primary">
                  Solubility in laboratory solvents
                </h3>
                <ul className="mt-5 flex flex-col gap-4">
                  {product.solubility.map((s) => (
                    <li
                      key={`${s.solvent}-${s.concentration}`}
                      className="text-sm leading-6"
                    >
                      <span className="font-mono">{s.solvent}</span> —{' '}
                      {s.concentration}
                      {s.note && (
                        <span className="text-muted-foreground">
                          {' '}
                          ({s.note})
                        </span>
                      )}
                      <span className="mt-1 block font-mono text-[11px] text-muted-foreground">
                        Source: {s.source}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* ---------- Documentation ---------- */}
      <section className="mx-auto max-w-[1500px] border-b border-border px-5 py-14 sm:px-8 lg:px-12">
        <h2
          id="material-documents"
          className="font-display text-xl font-semibold"
        >
          Documentation
        </h2>
        <p className="mt-5 max-w-2xl leading-8 text-muted-foreground">
          Quality claims that describe a product line are marketing. Quality
          claims that describe a lot are useful. Every certificate is tied to a
          lot number, and the chromatogram is attached rather than summarized.
        </p>

        <div className="mt-9 grid gap-px bg-border sm:grid-cols-2">
          <div className="bg-background p-7">
            <h3 className="font-display text-xl font-bold tracking-tight">
              Supplied with every shipment
            </h3>
            <ul className="mt-5 flex flex-col gap-2 leading-7 text-muted-foreground">
              {STANDARD_DOCUMENTATION.map((d) => (
                <li key={d}>{d}</li>
              ))}
            </ul>
          </div>

          <div className="bg-background p-7">
            <h3 className="font-display text-xl font-bold tracking-tight">
              Look up a lot
            </h3>
            <p className="mt-5 leading-7 text-muted-foreground">
              Enter a lot number to retrieve the certificate of analysis, the
              HPLC chromatogram and the mass spectrum for material you already
              hold.
            </p>
            <Link
              href="/documentation/lot-lookup"
              className="mt-7 inline-flex h-12 items-center gap-2 border border-foreground/20 px-6 text-sm font-bold transition-colors hover:border-primary hover:text-primary"
            >
              <FileText className="size-4" /> Lot lookup
            </Link>
          </div>
        </div>

        {(product.hasSds || sds) && (
          <div className="mt-7 max-w-2xl">
            <p className="leading-7 text-muted-foreground">
              A safety data sheet is supplied with this material. Hazard
              classifications published by different suppliers are not identical
              for every compound; the SDS issued with your lot governs and
              should be read before handling.
            </p>
            {sds ? (
              <a
                href={`/api/products/${product.code}/sds`}
                className="mt-4 inline-flex h-11 items-center gap-2 border border-foreground/20 px-5 text-sm font-bold transition-colors hover:border-primary hover:text-primary"
              >
                <FileText className="size-4" /> Safety data sheet
                {sds.revision ? ` (${sds.revision})` : ''}
              </a>
            ) : (
              <p className="mt-3 text-sm text-muted-foreground">
                The current sheet is issued with the shipment and on request at
                research@nexphaselabs.net.
              </p>
            )}
          </div>
        )}
      </section>

      {/* ---------- Commercial ---------- */}
      <section className="mx-auto max-w-[1500px] border-b border-border px-5 py-14 sm:px-8 lg:px-12">
        <h2 id="material-packs" className="font-display text-xl font-semibold">
          Pack sizes and availability
        </h2>

        <p className="mt-3 text-sm text-muted-foreground">
          Reference photos identify the material, not a selected pack size. Use
          the quantities listed below when ordering.
        </p>
        <div className="mt-6 max-w-2xl border border-border">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border bg-secondary px-4 py-3">
            <span className="utility-label text-muted-foreground">
              Quantity
            </span>
            <span className="utility-label text-muted-foreground">Status</span>
            {visibility.pricing !== 'none' && (
              <span className="utility-label text-muted-foreground">Price</span>
            )}
          </div>
          {cartFlag && (
            <p
              role="alert"
              className="border-b border-border bg-secondary px-6 py-3 text-sm"
            >
              {cartFlag === 'error' && why
                ? why.slice(0, 200)
                : cartFlag === 'invalid'
                  ? 'That pack size is not valid.'
                  : 'The cart is temporarily unavailable.'}
            </p>
          )}
          {activeVariants.map((variant) => {
            const cents = priceFor(variant, visibility.pricing);
            return (
              <div
                key={variant.sku}
                className="flex flex-wrap items-center justify-between gap-4 border-b border-border px-4 py-4 last:border-b-0"
              >
                <span className="font-mono text-sm">
                  {variant.quantity}
                  <span className="block text-xs text-muted-foreground">
                    {variant.presentation}
                  </span>
                </span>
                <span className="text-sm text-muted-foreground">
                  {STATUS_LABEL[product.status]}
                </span>
                {visibility.pricing !== 'none' && (
                  <span className="flex flex-wrap items-center justify-end gap-3 text-right font-mono text-sm">
                    {cents === null ? (
                      'Price on request'
                    ) : (
                      <>
                        {formatCents(cents)}
                        <form
                          method="post"
                          action="/api/cart"
                          className="flex items-center gap-2"
                        >
                          <input type="hidden" name="sku" value={variant.sku} />
                          <input
                            type="hidden"
                            name="return_to"
                            value={`/catalog/${product.slug}`}
                          />
                          <input
                            name="quantity"
                            type="number"
                            min={1}
                            max={50}
                            defaultValue={1}
                            aria-label={`Quantity for ${variant.sku}`}
                            className="h-11 w-16 border border-foreground/20 bg-background px-2 font-mono text-xs"
                          />
                          <button
                            type="submit"
                            className="h-11 bg-primary px-3 text-xs font-bold text-primary-foreground hover:bg-primary/90"
                          >
                            Add to cart
                          </button>
                        </form>
                      </>
                    )}
                  </span>
                )}
              </div>
            );
          })}
        </div>

        {visibility.pricing !== 'none' ? (
          <div className="mt-9 max-w-2xl">
            <p className="text-sm leading-6 text-muted-foreground">
              {visibility.pricing === 'institutional'
                ? 'Institutional prices shown'
                : 'Public prices shown'}
              .{' '}
              <Link href="/account/cart" className="font-semibold text-primary">
                View cart
              </Link>
              .
            </p>
            <h3 className="mt-8 utility-label text-primary">Released lots</h3>
            {releasedLots.length === 0 ? (
              <p className="mt-4 text-sm text-muted-foreground">
                No lot is currently released for this material.
              </p>
            ) : (
              <ul className="mt-4 divide-y divide-border border border-border">
                {releasedLots.map((lot) => (
                  <li
                    key={lot.lotNumber}
                    className="flex flex-wrap items-center justify-between gap-3 p-4 text-sm"
                  >
                    <Link
                      href={`/lots/${encodeURIComponent(lot.lotNumber)}`}
                      className="font-mono font-semibold text-primary"
                    >
                      {lot.lotNumber}
                    </Link>
                    <span className="font-mono text-xs text-muted-foreground">
                      {lot.manufacturerName ?? 'Manufacturer on COA'} &middot;
                      released {lot.releasedOn ?? '—'}
                      {lot.retestDate ? ` · retest ${lot.retestDate}` : ''}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ) : (
          /*
            Pricing behind verification. Not only a commercial choice — a gated
            catalog leaves no public product page to be read as an offer to the
            general public.
          */
          <div className="mt-9 flex max-w-2xl flex-col gap-5 border border-border bg-secondary p-7 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3">
              <Lock className="mt-1 size-4 shrink-0 text-primary" />
              <p className="text-sm leading-6">
                {visibility.reason === 'anonymous' &&
                  'Pricing and current lot availability are shown to verified research accounts. Every request is read by a person against a written research-use policy.'}
                {visibility.reason === 'unverified' &&
                  'Pricing and lot availability appear here once your organisation has been verified.'}
                {visibility.reason === 'acknowledgement' &&
                  'Confirm the current terms and research-use acknowledgement on your account page to see pricing.'}
                {visibility.reason === 'consumer_disabled' &&
                  'Pricing is available to verified research organisations. Contact research@nexphaselabs.net to submit one.'}
              </p>
            </div>
            <Link
              href={
                visibility.reason === 'anonymous'
                  ? '/access'
                  : visibility.reason === 'unverified'
                    ? '/account/organization'
                    : '/account'
              }
              className="inline-flex h-12 shrink-0 items-center justify-center bg-primary px-6 text-sm font-bold text-primary-foreground transition-colors hover:bg-primary/90"
            >
              {visibility.reason === 'anonymous'
                ? 'Request access'
                : visibility.reason === 'unverified'
                  ? account?.verificationStatus === 'none'
                    ? 'Submit your organisation'
                    : 'View your submission'
                  : 'Your account'}
            </Link>
          </div>
        )}
      </section>

      {/* ---------- Data provenance ---------- */}
      <section className="mx-auto max-w-[1500px] border-b border-border px-5 py-14 sm:px-8 lg:px-12">
        <h2 className="utility-label text-primary">Data provenance</h2>
        <p className="mt-5 max-w-2xl leading-8 text-muted-foreground">
          Where published values differ between suppliers, both are shown rather
          than reconciled. Values we could not attribute to a source are omitted
          rather than estimated.
        </p>
        <ul className="mt-7 flex max-w-3xl flex-col gap-3 border-t border-border pt-7">
          {product.sourceNotes.map((note) => (
            <li key={note} className="leading-7 text-muted-foreground">
              {note}
            </li>
          ))}
        </ul>
      </section>

      {/* ---------- Related, by chemical class only ---------- */}
      {related.length > 0 && (
        <section className="mx-auto max-w-[1500px] border-b border-border px-5 py-14 sm:px-8 lg:px-12">
          <h2 className="font-display text-2xl font-extrabold tracking-[-0.04em]">
            Also in {product.chemicalClass.toLowerCase()}
          </h2>
          <div className="mt-8 grid gap-px bg-border sm:grid-cols-3">
            {related.map((item) => (
              <Link
                key={item.slug}
                href={`/catalog/${item.slug}`}
                className="group bg-background p-7"
              >
                <p className="font-mono text-[11px] text-muted-foreground">
                  {item.code}
                </p>
                <h3 className="mt-3 font-display text-lg font-bold tracking-tight transition-colors group-hover:text-primary">
                  {item.name}
                </h3>
                <p className="mt-2 font-mono text-xs text-muted-foreground">
                  CAS {item.casNumber}
                </p>
              </Link>
            ))}
          </div>
        </section>
      )}

      <ResearchNoticeBlock />
    </main>
  );
}
