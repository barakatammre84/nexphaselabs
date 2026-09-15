import { openCheckoutEnabled } from '@/lib/site-config';
/**
 * The research-use boundary statement.
 *
 * This appears on every page. Do not remove it, and do not soften the wording
 * without legal review - it is the line that separates a research-material
 * catalog from a consumer health product, which is a different regulatory
 * category entirely.
 */
export function ResearchNoticeBar() {
  return (
    <div className="research-notice-bar">
      <div className="mx-auto flex max-w-[1280px] flex-col items-center justify-center gap-x-5 gap-y-1 px-4 py-2 text-center text-[11px] font-semibold leading-5 sm:flex-row sm:px-6">
        <span>Every released lot includes its own analytical record.</span>
        <span className="hidden size-1 rounded-full bg-white/45 sm:block" />
        <a href="/documentation/lot-lookup" className="font-extrabold text-white underline-offset-4 hover:underline">
          Find a COA
        </a>
        <span className="hidden size-1 rounded-full bg-white/45 sm:block" />
        <span className="text-white/72">Laboratory research use only.</span>
      </div>
    </div>
  );
}

export function ResearchNoticeBlock() {
  const open = openCheckoutEnabled();
  return (
    <section
      id="research-only"
      className="mx-auto mb-6 max-w-[1280px] overflow-hidden rounded-[2rem] bg-[var(--ion-navy)] px-6 py-12 text-white sm:px-10 lg:px-12"
    >
      <div className="mx-auto flex max-w-[1404px] flex-col justify-between gap-8 md:flex-row md:items-end">
        <div className="max-w-3xl">
          <p className="text-sm font-extrabold text-aqua-soft">Research-use boundary</p>
          <h2 className="mt-4 font-display text-3xl font-bold tracking-tight sm:text-4xl">
            For controlled laboratory research&mdash;not human or veterinary
            use.
          </h2>
          <p className="mt-4 max-w-2xl leading-7 text-white/68">
            {!open &&
              'Wholesale applications are read by a person before ordering opens. '}
            Materials are not medicines, supplements, or consumer products, and
            NexPhase Labs does not provide dosing guidance, protocols for
            administration, or any form of medical advice.
          </p>
        </div>
        <a
          href={open ? '/catalog' : '/account/sign-up?tier=institutional'}
          className="inline-flex h-12 shrink-0 items-center justify-center rounded-full bg-white px-6 text-sm font-extrabold text-[var(--ion-navy)] transition-transform hover:-translate-y-0.5"
        >
          {open ? 'Browse materials' : 'Apply for a wholesale account'}
        </a>
      </div>
    </section>
  );
}
