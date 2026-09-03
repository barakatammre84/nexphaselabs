import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowRight, Building2, CircleCheck, CircleX, Mail } from 'lucide-react';

export const metadata: Metadata = {
  title: 'Research access',
  description:
    'How to request a NexPhase Labs research account. Materials are supplied to qualified organizations for laboratory research use only.',
};

const qualifies = [
  'Universities, teaching hospitals, and academic laboratories',
  'Commercial and contract research organizations',
  'Analytical and testing laboratories',
  'Companies conducting in-house preclinical research',
];

const doesNotQualify = [
  'Individuals ordering for personal use',
  'Clinics, practitioners, or compounding pharmacies intending administration to people',
  'Resellers intending to supply consumers',
  'Any use in or on humans or animals',
];

const required = [
  { label: 'Organization', detail: 'Legal name, website, and physical shipping address. No residential addresses.' },
  { label: 'Named contact', detail: 'Full name, role, and an email address on the organization domain.' },
  { label: 'Research context', detail: 'A short description of the work the material will be used in.' },
  { label: 'Receiving party', detail: 'Who takes delivery and who is responsible for storage and handling.' },
  { label: 'Materials of interest', detail: 'Catalog codes and quantities you expect to order.' },
  { label: 'Tax or registration number', detail: 'Used to confirm the organization exists as described.' },
];

const MAIL_SUBJECT = 'Research account request';
const MAIL_BODY = [
  'Organization legal name:',
  'Website:',
  'Shipping address (no residential addresses):',
  '',
  'Contact name and role:',
  'Organization email address:',
  'Phone:',
  '',
  'Research context (what the material will be used in):',
  '',
  'Receiving party responsible for storage and handling:',
  '',
  'Materials of interest (catalog codes and quantities):',
  '',
  'Tax or business registration number:',
  '',
  'I confirm this request is made on behalf of the organization above, that materials will be used strictly for',
  'laboratory research, and that they will not be administered to humans or animals.',
].join('\n');

const mailHref = `mailto:research@nexphaselabs.net?subject=${encodeURIComponent(MAIL_SUBJECT)}&body=${encodeURIComponent(MAIL_BODY)}`;

export default function AccessPage() {
  return (
    <main className="bg-background text-foreground">
      <section className="mx-auto max-w-[1500px] border-b border-border px-5 py-14 sm:px-8 lg:px-12 lg:py-20">
        <p className="utility-label flex items-center gap-3 text-primary">
          <span className="h-px w-8 bg-primary" />
          Research access
        </p>
        <h1 className="mt-7 max-w-4xl font-display text-[clamp(2.6rem,5vw,4.6rem)] font-extrabold leading-[0.92] tracking-[-0.06em]">
          Accounts are reviewed, not issued.
        </h1>
        <p className="mt-7 max-w-2xl text-lg leading-8 text-muted-foreground">
          NexPhase Labs supplies research materials to qualified organizations only. Every request is read by a
          person before an account is opened, and requests that fall outside our research-use policy are declined.
        </p>
        <div className="mt-9 flex flex-col gap-4 sm:flex-row">
          <Link
            href="/account/sign-up"
            className="inline-flex h-12 items-center justify-center gap-3 bg-primary px-6 text-sm font-bold text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Create a research account
          </Link>
          <a
            href={mailHref}
            className="inline-flex h-12 items-center justify-center gap-3 border border-foreground/20 px-6 text-sm font-bold transition-colors hover:border-primary hover:text-primary"
          >
            <Mail className="size-4" />
            Or start by email
          </a>
        </div>
        <p className="mt-4 font-mono text-xs text-muted-foreground">
          An account lets you submit your organisation for verification online. The email option opens a message
          to research@nexphaselabs.net with the required fields laid out.
        </p>
      </section>

      <section className="mx-auto grid max-w-[1500px] gap-px border-b border-border bg-border lg:grid-cols-2">
        <div className="bg-background p-7 lg:p-12">
          <div className="flex items-center gap-3">
            <CircleCheck className="size-5 text-primary" />
            <h2 className="font-display text-2xl font-bold tracking-tight">Who qualifies</h2>
          </div>
          <ul className="mt-7 space-y-4">
            {qualifies.map((item) => (
              <li key={item} className="flex gap-3 leading-7 text-muted-foreground">
                <span className="mt-3 size-1.5 shrink-0 bg-primary" aria-hidden="true" />
                {item}
              </li>
            ))}
          </ul>
        </div>
        <div className="bg-background p-7 lg:p-12">
          <div className="flex items-center gap-3">
            <CircleX className="size-5 text-destructive" />
            <h2 className="font-display text-2xl font-bold tracking-tight">Who does not</h2>
          </div>
          <ul className="mt-7 space-y-4">
            {doesNotQualify.map((item) => (
              <li key={item} className="flex gap-3 leading-7 text-muted-foreground">
                <span className="mt-3 size-1.5 shrink-0 bg-destructive" aria-hidden="true" />
                {item}
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="mx-auto max-w-[1500px] border-b border-border px-5 py-14 sm:px-8 lg:px-12">
        <div className="grid gap-12 lg:grid-cols-[0.85fr_1.15fr]">
          <div>
            <div className="flex items-center gap-3">
              <Building2 className="size-5 text-primary" />
              <p className="utility-label text-primary">What to include</p>
            </div>
            <h2 className="mt-4 font-display text-3xl font-extrabold tracking-[-0.04em] sm:text-4xl">
              Six things, and the review moves quickly.
            </h2>
            <p className="mt-5 leading-8 text-muted-foreground">
              Incomplete requests are the main reason an account takes longer than it should. Sending everything
              below in the first message usually means a decision within two business days.
            </p>
            <a href={mailHref} className="mt-7 inline-flex items-center gap-2 text-sm font-bold text-primary">
              Open a pre-filled request <ArrowRight className="size-4" />
            </a>
          </div>
          <dl className="border-t border-border">
            {required.map((item) => (
              <div key={item.label} className="grid gap-1 border-b border-border py-4 sm:grid-cols-[220px_1fr] sm:gap-6">
                <dt className="text-sm font-semibold">{item.label}</dt>
                <dd className="text-sm leading-6 text-muted-foreground">{item.detail}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      <section className="bg-foreground px-5 py-14 text-background sm:px-8 lg:px-12">
        <div className="mx-auto max-w-[1404px]">
          <p className="utility-label text-[#5dd6ef]">Terms of every account</p>
          <h2 className="mt-4 max-w-3xl font-display text-3xl font-bold tracking-tight sm:text-4xl">
            Approval is conditional on research use.
          </h2>
          <p className="mt-5 max-w-3xl leading-7 text-background/65">
            By opening an account, the organization confirms that materials will be used strictly for laboratory
            research, that they will not be administered to humans or animals, that they will not be resold to
            consumers, and that the organization is responsible for compliance with all applicable federal, state,
            and local law. NexPhase Labs may decline or close an account at any time, and does not provide dosing
            guidance, administration protocols, or medical advice of any kind.
          </p>
        </div>
      </section>
    </main>
  );
}
