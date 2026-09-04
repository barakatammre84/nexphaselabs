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
    <div className="border-b border-border bg-secondary">
      <p className="mx-auto max-w-[1500px] px-5 py-2.5 text-center font-mono text-[11px] leading-5 tracking-[0.04em] text-muted-foreground sm:px-8 lg:px-12">
        All materials are supplied for laboratory research use only. Not for
        human or veterinary use, not for clinical or diagnostic procedures, and
        not for consumption.
      </p>
    </div>
  );
}

export function ResearchNoticeBlock() {
  const open = openCheckoutEnabled();
  return (
    <section
      id="research-only"
      className="bg-foreground px-5 py-14 text-background sm:px-8 lg:px-12"
    >
      <div className="mx-auto flex max-w-[1404px] flex-col justify-between gap-8 md:flex-row md:items-end">
        <div className="max-w-3xl">
          <p className="utility-label text-[#5dd6ef]">Research-use boundary</p>
          <h2 className="mt-4 font-display text-3xl font-bold tracking-tight sm:text-4xl">
            For controlled laboratory research&mdash;not human or veterinary
            use.
          </h2>
          <p className="mt-4 max-w-2xl leading-7 text-background/65">
            {!open &&
              'Research account requests are reviewed before ordering. '}
            Materials are not medicines, supplements, or consumer products, and
            NexPhase Labs does not provide dosing guidance, protocols for
            administration, or any form of medical advice.
          </p>
        </div>
        <a
          href={open ? '/catalog' : '/access'}
          className="inline-flex h-12 shrink-0 items-center justify-center bg-[#5dd6ef] px-6 text-sm font-bold text-foreground transition-colors hover:bg-white"
        >
          {open ? 'Browse materials' : 'Start an account request'}
        </a>
      </div>
    </section>
  );
}
