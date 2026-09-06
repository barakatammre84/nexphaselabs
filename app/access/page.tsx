import { openCheckoutEnabled } from '@/lib/site-config';
import type { Metadata } from 'next';
import Link from 'next/link';
import {
  ArrowRight,
  Building2,
  CircleCheck,
  CircleX,
  Mail,
} from 'lucide-react';

import { AccessProgress } from '@/components/site/access-progress';

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
  {
    label: 'Organization',
    detail:
      'Legal name, website, and physical shipping address. No residential addresses.',
  },
  {
    label: 'Named contact',
    detail: 'Full name, role, and an email address on the organization domain.',
  },
  {
    label: 'Research context',
    detail: 'A short description of the work the material will be used in.',
  },
  {
    label: 'Receiving party',
    detail:
      'Who takes delivery and who is responsible for storage and handling.',
  },
  {
    label: 'Materials of interest',
    detail: 'Catalog codes and quantities you expect to order.',
  },
  {
    label: 'Tax or registration number',
    detail: 'Used to confirm the organization exists as described.',
  },
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
  if (openCheckoutEnabled())
    return (
      <main className="ion-panel mx-auto my-12 max-w-3xl px-7 py-12 sm:px-10">
        <p className="utility-label text-primary">Guest checkout</p>
        <h1 className="page-title mt-4">No account required.</h1>
        <p className="mt-6 text-lg leading-8 text-muted-foreground">
          Choose a material, add a pack size to your cart, enter your delivery
          details, and continue to payment. No registration, email verification,
          or institutional approval.
        </p>
        <p className="mt-4 text-sm leading-6">
          All materials remain for laboratory research use only. Staging
          purchases use simulated payments; no money moves.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Link href="/catalog" className="action-primary">
            Browse materials
          </Link>
          <Link href="/account/cart" className="action-secondary">
            View cart
          </Link>
        </div>
      </main>
    );

  return (
    <main className="text-foreground">
      <section className="ion-panel mx-auto my-8 max-w-[1232px] px-7 py-12 sm:px-10 lg:px-12">
        <p className="ion-kicker">
          Research access
        </p>
        <h1 className="ion-heading mt-6 max-w-4xl text-4xl sm:text-6xl">
          A clear path to research access.
        </h1>
        <p className="mt-7 max-w-2xl text-lg leading-8 text-muted-foreground">
          Create your login and confirm your email, then submit your
          organization for review. A login is not approval to purchase: pricing
          and ordering open only after your organization is approved.
        </p>
        <div className="max-w-3xl">
          <AccessProgress current={0} />
        </div>
        <div className="mt-9 flex flex-col gap-4 sm:flex-row">
          <Link
            href="/account/sign-up"
            className="action-primary gap-3"
          >
            Create your login
          </Link>
          <a
            href={mailHref}
            className="action-secondary gap-3"
          >
            <Mail className="size-4" />
            Need help applying?
          </a>
        </div>
        <p className="mt-4 font-mono text-xs text-muted-foreground">
          Already registered? Sign in to view your application and any requests
          from our team. Email support is available if you need help with the
          online application.
        </p>
        <Link
          href="/account/sign-in"
          className="mt-3 inline-flex py-2 font-semibold text-primary"
        >
          Sign in to continue
        </Link>
      </section>

      <section className="ion-panel mx-auto my-8 grid max-w-[1232px] gap-px overflow-hidden bg-border lg:grid-cols-2">
        <div className="bg-background p-7 lg:p-12">
          <div className="flex items-center gap-3">
            <CircleCheck className="size-5 text-primary" />
            <h2 className="font-display text-2xl font-bold tracking-tight">
              Who qualifies
            </h2>
          </div>
          <ul className="mt-7 space-y-4">
            {qualifies.map((item) => (
              <li
                key={item}
                className="flex gap-3 leading-7 text-muted-foreground"
              >
                <span
                  className="mt-3 size-1.5 shrink-0 bg-primary"
                  aria-hidden="true"
                />
                {item}
              </li>
            ))}
          </ul>
        </div>
        <div className="bg-background p-7 lg:p-12">
          <div className="flex items-center gap-3">
            <CircleX className="size-5 text-destructive" />
            <h2 className="font-display text-2xl font-bold tracking-tight">
              Who does not
            </h2>
          </div>
          <ul className="mt-7 space-y-4">
            {doesNotQualify.map((item) => (
              <li
                key={item}
                className="flex gap-3 leading-7 text-muted-foreground"
              >
                <span
                  className="mt-3 size-1.5 shrink-0 bg-destructive"
                  aria-hidden="true"
                />
                {item}
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="ion-panel mx-auto my-8 max-w-[1232px] px-7 py-12 sm:px-10 lg:px-12">
        <div className="grid gap-12 lg:grid-cols-[0.85fr_1.15fr]">
          <div>
            <div className="flex items-center gap-3">
              <Building2 className="size-5 text-primary" />
              <p className="utility-label text-primary">What to include</p>
            </div>
            <h2 className="mt-4 font-display text-3xl font-extrabold tracking-[-0.04em] sm:text-4xl">
              Have your organization details ready.
            </h2>
            <p className="mt-5 leading-8 text-muted-foreground">
              The online form collects your organization, receiving address, and
              research context. Supporting documents can be uploaded after
              submission. Check your account for the review status and any
              requested changes.
            </p>
            <a
              href={mailHref}
              className="mt-7 inline-flex items-center gap-2 text-sm font-bold text-primary"
            >
              Open a pre-filled request <ArrowRight className="size-4" />
            </a>
          </div>
          <dl className="border-t border-border">
            {required.map((item) => (
              <div
                key={item.label}
                className="grid gap-1 border-b border-border py-4 sm:grid-cols-[220px_1fr] sm:gap-6"
              >
                <dt className="text-sm font-semibold">{item.label}</dt>
                <dd className="text-sm leading-6 text-muted-foreground">
                  {item.detail}
                </dd>
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
            By opening an account, the organization confirms that materials will
            be used strictly for laboratory research, that they will not be
            administered to humans or animals, that they will not be resold to
            consumers, and that the organization is responsible for compliance
            with all applicable federal, state, and local law. NexPhase Labs may
            decline or close an account at any time, and does not provide dosing
            guidance, administration protocols, or medical advice of any kind.
          </p>
        </div>
      </section>
    </main>
  );
}
