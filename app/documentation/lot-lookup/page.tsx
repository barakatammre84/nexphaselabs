import type { Metadata } from 'next';
import { LotLookup } from '@/components/site/lot-lookup';
import { ResearchNoticeBlock } from '@/components/site/research-notice';

export const metadata: Metadata = {
  title: 'Lot lookup',
  description:
    'Search released NexPhase Labs lots by lot number, accession number, or material and retrieve their analytical documentation.',
};

export default function LotLookupPage() {
  return (
    <main className="text-foreground">
      <section className="mx-auto max-w-[1280px] px-4 pb-8 pt-3 sm:px-6">
        <div className="ion-hero px-7 py-14 sm:px-12 lg:px-16 lg:py-20">
          <p className="inline-flex rounded-full border border-white/20 bg-white/10 px-4 py-2 text-xs font-extrabold">
            COA library
          </p>
          <h1 className="mt-7 max-w-3xl font-display text-[clamp(3rem,6vw,5.5rem)] font-extrabold leading-[0.95] tracking-[-0.065em]">
            Find your batch documentation.
          </h1>
          <p className="mt-7 max-w-2xl text-lg leading-8 text-white/72">
            Search by the lot number printed on the vial, the accession number
            on the certificate, or the material. The record returned is the one
            issued for that lot: the measured purity and the method used, the
            identity confirmation, the manufacturer of record, and the
            analytical files. No account is required to read it.
          </p>
        </div>
      </section>

      <section className="mx-auto max-w-[1080px] px-4 py-12 sm:px-6">
        <div className="ion-panel p-7 sm:p-10">
          <LotLookup />
        </div>
      </section>

      <section className="mx-auto max-w-[1080px] px-4 pb-20 sm:px-6">
        <div className="grid gap-5 lg:grid-cols-3">
          <div className="ion-panel p-7 lg:p-9">
            <span className="font-mono text-[11px] text-muted-foreground">
              01
            </span>
            <h2 className="mt-6 font-display text-xl font-bold tracking-tight">
              The manufacturer, not the seller
            </h2>
            <p className="mt-3 leading-7 text-muted-foreground">
              Every released lot names the establishment that actually made the
              material and its address. A certificate that identifies only a
              distributor tells you nothing about where the material came from,
              and in California it cannot lawfully be relied on for sterile
              compounding.
            </p>
          </div>
          <div className="ion-panel p-7 lg:p-9">
            <span className="font-mono text-[11px] text-muted-foreground">
              02
            </span>
            <h2 className="mt-6 font-display text-xl font-bold tracking-tight">
              Methods, not adjectives
            </h2>
            <p className="mt-3 leading-7 text-muted-foreground">
              Purity is reported with the method that produced it and the
              specification it was measured against. Identity is confirmed by
              mass spectrometry against the expected mass. A number without a
              method is not a result.
            </p>
          </div>
          <div className="ion-panel p-7 lg:p-9">
            <span className="font-mono text-[11px] text-muted-foreground">
              03
            </span>
            <h2 className="mt-6 font-display text-xl font-bold tracking-tight">
              Only released lots resolve
            </h2>
            <p className="mt-3 leading-7 text-muted-foreground">
              Material is quarantined on receipt and stays there until a named
              person releases it against the record. A lot number that returns
              nothing has not been released, and nothing bearing it should be in
              your hands.
            </p>
          </div>
        </div>
      </section>

      <ResearchNoticeBlock />
    </main>
  );
}
