import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowRight, FileText, FlaskConical, Microscope, PackageCheck, Thermometer } from 'lucide-react';
import { ResearchNoticeBlock } from '@/components/site/research-notice';

export const metadata: Metadata = {
  title: 'Documentation & QC',
  description:
    'What NexPhase Labs tests, what a certificate of analysis contains, and how research materials are stored, packed, and shipped.',
};

const coaContents = [
  { label: 'Material name and catalog code', detail: 'Matching the vial label exactly.' },
  { label: 'Lot number', detail: 'The unique identifier for that production run.' },
  { label: 'Manufacture and retest dates', detail: 'So the receiving laboratory can judge age.' },
  { label: 'Appearance', detail: 'Observed physical description of the lyophilized material.' },
  { label: 'Identity confirmation', detail: 'Mass spectrometry result confirming the expected mass.' },
  { label: 'Purity result', detail: 'HPLC area-percent purity for that lot, with the chromatogram attached.' },
  { label: 'Fill weight', detail: 'Nominal quantity in the vial.' },
  { label: 'Analyst and release date', detail: 'Who released the lot, and when.' },
];

const qcStages = [
  {
    icon: Microscope,
    step: '01',
    title: 'Incoming material check',
    copy: 'Material arriving from a manufacturing partner is checked against its accompanying documentation before it is accepted into inventory. A mismatch between paperwork and label stops the lot.',
  },
  {
    icon: FlaskConical,
    step: '02',
    title: 'Analytical testing',
    copy: 'Identity is confirmed by mass spectrometry and purity is measured by HPLC. Results are recorded against the lot number, not the product line.',
  },
  {
    icon: FileText,
    step: '03',
    title: 'Certificate issued per lot',
    copy: 'A certificate of analysis is generated for the specific lot and travels with every vial from that lot. The chromatogram is attached, not summarized.',
  },
  {
    icon: PackageCheck,
    step: '04',
    title: 'Release and packing',
    copy: 'Vials are packed with the storage sheet and lot documentation. Cold-chain packaging is used where the material calls for it.',
  },
];

export default function DocumentationPage() {
  return (
    <main className="bg-background text-foreground">
      <section className="mx-auto max-w-[1500px] border-b border-border px-5 py-14 sm:px-8 lg:px-12 lg:py-20">
        <p className="utility-label flex items-center gap-3 text-primary">
          <span className="h-px w-8 bg-primary" />
          Documentation &amp; quality control
        </p>
        <h1 className="mt-7 max-w-4xl font-display text-[clamp(2.6rem,5vw,4.6rem)] font-extrabold leading-[0.92] tracking-[-0.06em]">
          The paperwork should describe the vial, not the product line.
        </h1>
        <p className="mt-7 max-w-2xl text-lg leading-8 text-muted-foreground">
          A generic certificate tells a laboratory almost nothing. Every NexPhase Labs shipment carries analytical
          documentation tied to the lot number printed on the vial you received.
        </p>
      </section>

      <section className="mx-auto max-w-[1500px] border-b border-border px-5 py-14 sm:px-8 lg:px-12">
        <h2 className="font-display text-3xl font-extrabold tracking-[-0.04em] sm:text-4xl">How a lot reaches you</h2>
        <ol className="mt-10 grid gap-px bg-border sm:grid-cols-2 lg:grid-cols-4">
          {qcStages.map(({ icon: Icon, step, title, copy }) => (
            <li key={step} className="bg-background p-7">
              <div className="mb-10 flex items-center justify-between">
                <Icon className="size-5 text-primary" />
                <span className="font-mono text-[11px] text-muted-foreground">{step}</span>
              </div>
              <h3 className="font-display text-lg font-bold leading-tight">{title}</h3>
              <p className="mt-3 text-sm leading-6 text-muted-foreground">{copy}</p>
            </li>
          ))}
        </ol>
      </section>

      <section id="coa" className="mx-auto max-w-[1500px] scroll-mt-32 border-b border-border px-5 py-14 sm:px-8 lg:px-12">
        <div className="grid gap-12 lg:grid-cols-[0.85fr_1.15fr]">
          <div>
            <p className="utility-label text-primary">Certificate of analysis</p>
            <h2 className="mt-3 font-display text-3xl font-extrabold tracking-[-0.04em] sm:text-4xl">
              What is on the certificate.
            </h2>
            <p className="mt-5 leading-8 text-muted-foreground">
              Every field below appears on the certificate issued for your lot. If a value is missing or you cannot
              reconcile it with the vial in front of you, contact us before using the material.
            </p>
            <a
              href="mailto:research@nexphaselabs.net?subject=COA%20request"
              className="mt-7 inline-flex items-center gap-2 text-sm font-bold text-primary"
            >
              Request a sample certificate <ArrowRight className="size-4" />
            </a>
          </div>
          <dl className="border-t border-border">
            {coaContents.map((item) => (
              <div key={item.label} className="grid gap-1 border-b border-border py-4 sm:grid-cols-[260px_1fr] sm:gap-6">
                <dt className="text-sm font-semibold">{item.label}</dt>
                <dd className="text-sm leading-6 text-muted-foreground">{item.detail}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      <section id="handling" className="mx-auto max-w-[1500px] scroll-mt-32 border-b border-border px-5 py-14 sm:px-8 lg:px-12">
        <div className="grid gap-12 lg:grid-cols-[0.85fr_1.15fr]">
          <div>
            <p className="utility-label text-primary">Storage &amp; handling</p>
            <h2 className="mt-3 font-display text-3xl font-extrabold tracking-[-0.04em] sm:text-4xl">
              Conditions are per material.
            </h2>
            <p className="mt-5 leading-8 text-muted-foreground">
              Each catalog entry lists its own storage conditions, and the sheet packed with the shipment repeats
              them. The guidance below is general; the material page governs.
            </p>
            <Link href="/catalog" className="mt-7 inline-flex items-center gap-2 text-sm font-bold text-primary">
              See per-material conditions <ArrowRight className="size-4" />
            </Link>
          </div>
          <ul className="grid gap-px bg-border sm:grid-cols-2">
            {[
              {
                icon: Thermometer,
                title: 'Sealed vials',
                copy: 'Most lyophilized materials are stored at -20 °C, protected from light and moisture, until reconstitution.',
              },
              {
                icon: FlaskConical,
                title: 'After reconstitution',
                copy: 'Stability drops sharply. Prepare working solutions fresh and follow the receiving laboratory protocol.',
              },
              {
                icon: PackageCheck,
                title: 'On arrival',
                copy: 'Inspect the vial and seal, check the lot number against the certificate, and record receipt before storage.',
              },
              {
                icon: FileText,
                title: 'Record keeping',
                copy: 'Keep the certificate with the lot. It is the reference point for any question raised later.',
              },
            ].map(({ icon: Icon, title, copy }) => (
              <li key={title} className="bg-background p-6">
                <Icon className="size-5 text-primary" />
                <h3 className="mt-6 font-display text-lg font-bold">{title}</h3>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">{copy}</p>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <ResearchNoticeBlock />
    </main>
  );
}
