import type { Metadata } from 'next';
import { LotLookup } from '@/components/site/lot-lookup';
import { ResearchNoticeBlock } from '@/components/site/research-notice';

export const metadata: Metadata = {
  title: 'Lot lookup',
  description:
    'Retrieve the certificate of analysis, chromatogram and mass spectrum for a NexPhase Labs lot number.',
};

export default function LotLookupPage() {
  return (
    <main className="bg-background text-foreground">
      <section className="mx-auto max-w-[1500px] border-b border-border px-5 py-14 sm:px-8 lg:px-12 lg:py-20">
        <p className="utility-label flex items-center gap-3 text-primary">
          <span className="h-px w-8 bg-primary" />
          Documentation
        </p>
        <h1 className="mt-7 max-w-3xl font-display text-[clamp(2.4rem,5vw,4.2rem)] font-extrabold leading-[0.94] tracking-[-0.055em]">
          Look up any lot we have shipped.
        </h1>
        <p className="mt-7 max-w-2xl text-lg leading-8 text-muted-foreground">
          Enter the lot number printed on the vial. The record returned is the one issued for that
          lot: the measured purity and the method used, the identity confirmation, the manufacturer
          of record, and the analytical files. No account is required to read it.
        </p>
      </section>

      <section className="mx-auto max-w-[1500px] border-b border-border px-5 py-14 sm:px-8 lg:px-12">
        <LotLookup />
      </section>

      <section className="mx-auto max-w-[1500px] border-b border-border px-5 py-14 sm:px-8 lg:px-12">
        <div className="grid gap-px bg-border lg:grid-cols-3">
          <div className="bg-background p-7 lg:p-9">
            <span className="font-mono text-[11px] text-muted-foreground">01</span>
            <h2 className="mt-6 font-display text-xl font-bold tracking-tight">
              The manufacturer, not the seller
            </h2>
            <p className="mt-3 leading-7 text-muted-foreground">
              Every released lot names the establishment that actually made the material and its
              address. A certificate that identifies only a distributor tells you nothing about
              where the material came from, and in California it cannot lawfully be relied on for
              sterile compounding.
            </p>
          </div>
          <div className="bg-background p-7 lg:p-9">
            <span className="font-mono text-[11px] text-muted-foreground">02</span>
            <h2 className="mt-6 font-display text-xl font-bold tracking-tight">
              Methods, not adjectives
            </h2>
            <p className="mt-3 leading-7 text-muted-foreground">
              Purity is reported with the method that produced it and the specification it was
              measured against. Identity is confirmed by mass spectrometry against the expected
              mass. A number without a method is not a result.
            </p>
          </div>
          <div className="bg-background p-7 lg:p-9">
            <span className="font-mono text-[11px] text-muted-foreground">03</span>
            <h2 className="mt-6 font-display text-xl font-bold tracking-tight">
              Only released lots resolve
            </h2>
            <p className="mt-3 leading-7 text-muted-foreground">
              Material is quarantined on receipt and stays there until a named person releases it
              against the record. A lot number that returns nothing has not been released, and
              nothing bearing it should be in your hands.
            </p>
          </div>
        </div>
      </section>

      <ResearchNoticeBlock />
    </main>
  );
}
