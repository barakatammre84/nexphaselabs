import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, FileText, Lock } from 'lucide-react';
import { CatalogUnavailable } from '@/components/site/catalog-unavailable';
import { ProductImage } from '@/components/site/product-image';
import { SupportStrip } from '@/components/site/support-strip';
import { ProductPurchasePanel } from '@/components/site/product-purchase-panel';
import { ResearchNoticeBlock } from '@/components/site/research-notice';
import { REGULATORY_STATEMENT, STANDARD_DOCUMENTATION } from '@/lib/catalog';
import { loadCatalog } from '@/lib/catalog-data';
import { getStorefrontProduct, listStorefrontProducts, visibleStock } from '@/lib/storefront';
import { listReleasedLotsForProduct } from '@/lib/lots-public';
import { currentSds } from '@/lib/product-documents';
import { STOREFRONT_COPY } from '@/lib/storefront-copy';
import { accountRequired, openCheckoutEnabled } from '@/lib/site-config';
import { cookies } from 'next/headers';
import { NOTICE_COOKIE, readNotice } from '@/lib/notice';
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
  searchParams: Promise<{ cart?: string }>;
};

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const loaded = await loadCatalog(() => getStorefrontProduct(slug));
  const product = loaded.data;
  if (!product)
    return {
      title: loaded.unavailable ? 'Catalog unavailable' : 'Material not found',
    };

  return {
    title: `${product.name} — ${product.code}`,
    description: `${product.name}, CAS ${product.casNumber}, ${product.purity}. Research material for laboratory use only; every lot ships with its certificate of analysis.`,
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
  const { cart: cartFlag } = await searchParams;
  // A refusal's words come from the cookie the cart route set, never from the link (lib/notice.ts).
  const cartNotice =
    cartFlag === 'error' ? readNotice((await cookies()).get(NOTICE_COOKIE)?.value) : null;
  const loaded = await loadCatalog(() => getStorefrontProduct(slug));

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
  // Drafts, withdrawn products and anything not on the storefront (no photo,
  // no approved price, no publishable lot) 404 here exactly like an unknown slug.
  if (!product) notFound();

  const siblings = await loadCatalog(listStorefrontProducts);
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
  // Prices can show to a tier that cannot order yet (researchers while ordering is
  // wholesale-only); only a buyer who can order gets an order button.
  const canOrder =
    openCheckoutEnabled() ||
    (account?.tier === 'institutional' && account.verificationStatus === 'approved');
  const releasedLots = visibility.availability
    ? ((await loadCatalog(() => listReleasedLotsForProduct(product.code)))
        .data ?? [])
    : [];
  const activeVariants = product.variants.filter((v) => v.active);
  const sds = (await loadCatalog(() => currentSds(product.id))).data ?? null;
  const hasReleasedLot = releasedLots.length > 0;
  // Stock state is lot availability: null for a viewer who is not shown it.
  const stock = visibleStock(product, visibility);

  return (
    <main className="material-page text-foreground">
      <div className="mx-auto max-w-[1280px] px-4 pt-6 sm:px-6">
        <Link
          href="/catalog"
          className="inline-flex items-center gap-2 text-sm font-semibold text-muted-foreground transition-colors hover:text-primary"
        >
          <ArrowLeft className="size-4" />
          Back to catalog
        </Link>
      </div>

      {/* ---------- Identity header ---------- */}
      <section className="ion-panel mx-auto mt-5 max-w-[1232px] px-6 py-8 sm:px-10 sm:py-10 lg:px-12">
        <div className="grid gap-10 lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)] lg:items-center lg:gap-14">
          <div className="lg:order-2">
            <p className="ion-kicker">
              {product.code} &middot; {product.chemicalClass}
            </p>
            <h1 className="ion-heading mt-6 text-[clamp(3rem,5vw,5rem)]">
              {product.name}
            </h1>
            <p className="mt-3 text-sm text-muted-foreground">
              CAS {product.casNumber} &middot; {product.form}
              {stock === 'out_of_stock' && (
                <span className="ml-3 rounded-full bg-[var(--ion-navy)] px-3 py-1 text-[10px] font-extrabold uppercase tracking-[0.08em] text-white">
                  Out of stock
                </span>
              )}
            </p>

            {/* Price first (Chapter 19 §19.4 #10): the purchase panel sits directly under the title. */}
            {visibility.pricing !== 'none' && (
              <ProductPurchasePanel
                productName={product.name}
                productSlug={product.slug}
                hasReleasedLot={hasReleasedLot && product.stock === 'in_stock'}
                pricing={visibility.pricing}
                canOrder={canOrder}
                orderingNote={STOREFRONT_COPY.orderingWholesaleOnly}
                variants={activeVariants.map((variant) => ({
                  sku: variant.sku,
                  quantity: variant.quantity,
                  presentation: variant.presentation,
                  sellable: product.sellableSkus.includes(variant.sku),
                  priceCents: priceFor(variant, visibility.pricing),
                  // Only this viewer's tier leaves the server: nobody receives another tier's break prices.
                  priceBreaks: variant.priceBreaks.map((row) => ({
                    minQuantity: row.minQuantity,
                    listPriceCents: visibility.pricing === 'researcher' ? row.listPriceCents : null,
                    institutionalPriceCents: visibility.pricing === 'institutional' ? row.institutionalPriceCents : null,
                  })),
                }))}
              />
            )}

            {/* Rule 1 — conditions of supply, in the body, directly under the price, above the fold. */}
            <div className="mt-6 max-w-2xl rounded-[1.25rem] border border-aqua-line bg-secondary px-5 py-4">
              <p className="text-sm font-extrabold text-primary">Conditions of supply</p>
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
          </div>

          <div className="relative aspect-square overflow-hidden rounded-[1.6rem] bg-secondary lg:order-1">
            <ProductImage
              code={product.code}
              name={product.name}
              image={product.image}
              sizes="(max-width: 1024px) 100vw, 42vw"
            />
          </div>
        </div>
      </section>

      <nav
        aria-label="Material sections"
        className="mx-auto flex max-w-[1280px] flex-wrap gap-3 px-4 py-7 sm:px-6"
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
      <section className="ion-panel mx-auto my-6 max-w-[1232px] px-6 py-10 sm:px-10 lg:px-12">
        <h2
          id="material-identity"
          className="ion-heading text-3xl sm:text-4xl"
        >
          Chemical identity
        </h2>
        <p className="mt-5 max-w-3xl leading-8 text-muted-foreground">{product.description}</p>
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
      <section className="ion-panel mx-auto my-6 max-w-[1232px] px-6 py-10 sm:px-10 lg:px-12">
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
      <section className="ion-panel mx-auto my-6 max-w-[1232px] px-6 py-10 sm:px-10 lg:px-12">
        <p className="ion-kicker">Batch tested and documented</p>
        <h2
          id="material-documents"
          className="ion-heading mt-5 text-3xl sm:text-4xl"
        >
          Lab results for this material
        </h2>
        <p className="mt-5 max-w-2xl leading-8 text-muted-foreground">
          Review documentation tied to a released lot—not a generic product-line
          certificate. Each record stays connected to the lot number on the vial.
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
      <section className="ion-panel mx-auto my-6 max-w-[1232px] px-6 py-10 sm:px-10 lg:px-12">
        <p className="ion-kicker">Choose your configuration</p>
        <h2 id="material-packs" className="ion-heading mt-5 text-3xl sm:text-4xl">
          Pack sizes and current availability
        </h2>

        <p className="mt-3 text-sm text-muted-foreground">
          Reference photos identify the material, not a selected pack size. Use
          the quantities listed below when ordering.
        </p>
        {visibility.pricing !== 'none' && (
          <div className="mt-5 flex max-w-2xl flex-wrap items-center justify-between gap-3 border-l-4 border-primary bg-secondary px-4 py-3 text-sm">
            {/* True of guest checkout only: in a closed storefront, whoever sees prices here is signed in. */}
            {openCheckoutEnabled() && !accountRequired() && (
              <span>
                Choose a pack below. No account or email verification is required.
              </span>
            )}
            <span className="font-semibold">
              Shipping and tax appear before payment.
            </span>
          </div>
        )}
        <div className="mt-6 max-w-3xl overflow-hidden rounded-[1.4rem] border border-border">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border bg-secondary px-4 py-3">
            <span className="utility-label text-muted-foreground">
              Quantity
            </span>
            {stock !== null && (
              <span className="utility-label text-muted-foreground">Status</span>
            )}
            {visibility.pricing !== 'none' && (
              <span className="utility-label text-muted-foreground">Price</span>
            )}
          </div>
          {cartFlag && (
            <p
              role="alert"
              className="border-b border-border bg-secondary px-6 py-3 text-sm"
            >
              {cartFlag === 'error'
                ? (cartNotice ?? 'That pack size could not be added to the cart.')
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
                {stock !== null && (
                  <span
                    className={`text-sm ${product.sellableSkus.includes(variant.sku) ? 'text-primary' : 'text-destructive'}`}
                  >
                    {product.sellableSkus.includes(variant.sku) ? 'In stock' : 'Out of stock'}
                  </span>
                )}
                {visibility.pricing !== 'none' && (
                  <span className="flex flex-wrap items-center justify-end gap-3 text-right font-mono text-sm">
                    {cents === null ? (
                      'Price on request'
                    ) : !product.sellableSkus.includes(variant.sku) || !canOrder ? (
                      <>
                        <span>{formatCents(cents)}</span>
                        <span className="text-xs text-muted-foreground">
                          {product.sellableSkus.includes(variant.sku) ? 'Wholesale ordering only' : 'Out of stock'}
                        </span>
                      </>
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
                            className="h-11 w-16 rounded-full border border-input bg-background px-3 font-mono text-xs"
                          />
                          <button
                            type="submit"
                            className="h-11 rounded-full bg-primary px-4 text-xs font-bold text-primary-foreground hover:bg-primary/90"
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

        <SupportStrip className="mt-9 max-w-2xl" />

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
                {visibility.reason === 'anonymous' && STOREFRONT_COPY.pricingAnonymous}
                {visibility.reason === 'sign_in' && STOREFRONT_COPY.pricingSignIn}
                {visibility.reason === 'unverified' && STOREFRONT_COPY.pricingUnverified}
                {visibility.reason === 'acknowledgement' &&
                  'Confirm the current terms, the research-use acknowledgement and the age statement on your account page to see pricing.'}
                {visibility.reason === 'researcher_tier_closed' && STOREFRONT_COPY.pricingResearcherClosed}
              </p>
            </div>
            <Link
              href={
                visibility.reason === 'anonymous' || visibility.reason === 'sign_in'
                  ? '/account/sign-up'
                  : visibility.reason === 'unverified'
                    ? '/account/organization'
                    : '/account'
              }
              className="inline-flex h-12 shrink-0 items-center justify-center bg-primary px-6 text-sm font-bold text-primary-foreground transition-colors hover:bg-primary/90"
            >
              {visibility.reason === 'sign_in'
                ? STOREFRONT_COPY.pricingSignInAction
                : visibility.reason === 'anonymous'
                ? STOREFRONT_COPY.pricingAnonymousAction
                : visibility.reason === 'unverified'
                  ? account?.verificationStatus === 'none'
                    ? STOREFRONT_COPY.pricingUnverifiedStart
                    : STOREFRONT_COPY.pricingUnverifiedView
                  : 'Your account'}
            </Link>
          </div>
        )}
      </section>

      {/* ---------- Data provenance ---------- */}
      <section className="ion-panel mx-auto my-6 max-w-[1232px] px-6 py-10 sm:px-10 lg:px-12">
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
        <section className="ion-panel mx-auto my-6 max-w-[1232px] px-6 py-10 sm:px-10 lg:px-12">
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
