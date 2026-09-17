import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowRight, Building2, ClipboardList, FileCheck2, UserCheck } from 'lucide-react';
import { SUPPORT } from '@/lib/support';

export const metadata: Metadata = {
  title: 'Wholesale accounts',
  description:
    'Purchase orders and net terms for universities, CROs and companies. A person reviews each application before ordering opens.',
};

const STEPS = [
  { title: 'Create the account', copy: 'Choose "Wholesale account" at sign-up and confirm the email address.', icon: UserCheck },
  { title: 'Tell us about the organization', copy: 'Its legal name and address, the ordering contact and, if you hold one, a resale or exemption certificate.', icon: Building2 },
  { title: 'A person reviews it', copy: 'Applications are read by staff, usually within two business days. We may ask a question by email.', icon: ClipboardList },
  { title: 'Order on purchase order', copy: 'Approved accounts order against a PO with net terms; every shipment carries its lot documents.', icon: FileCheck2 },
] as const;

/** What a wholesale account is and how to apply (owner, 16 Sep 2026). No prices, no claims. */
export default function WholesalePage() {
  return (
    <main className="text-foreground">
      <section className="mx-auto max-w-[1080px] px-4 py-10 sm:px-6">
        <div className="ion-page-hero p-7 sm:p-10">
          <p className="ion-kicker">For institutions</p>
          <h1 className="ion-heading mt-5 text-4xl sm:text-5xl">Wholesale accounts</h1>
          <p className="mt-4 max-w-2xl leading-7 text-muted-foreground">
            Universities, contract research organizations and companies buy on purchase order with
            net terms, with a named ordering contact and invoices addressed to the institution. A
            person approves each application before ordering opens.
          </p>
          <div className="mt-7 flex flex-wrap gap-3">
            <Link href="/account/sign-up?tier=institutional" className="action-primary">
              Apply for a wholesale account <ArrowRight className="size-4" />
            </Link>
            <Link href="/account/sign-in" className="inline-flex min-h-11 items-center px-2 text-sm font-semibold text-primary">
              Already have an account? Sign in
            </Link>
          </div>
        </div>

        <section className="ion-panel mt-8 p-7 sm:p-10">
          <h2 className="font-display text-xl font-bold tracking-tight">How it works</h2>
          <ol className="mt-6 grid gap-5 sm:grid-cols-2">
            {STEPS.map(({ title, copy, icon: Icon }, index) => (
              <li key={title} className="rounded-[1.2rem] border border-border p-5">
                <div className="flex items-center gap-3">
                  <Icon className="size-5 text-primary" />
                  <p className="font-semibold">
                    {index + 1}. {title}
                  </p>
                </div>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">{copy}</p>
              </li>
            ))}
          </ol>
        </section>

        <section className="ion-panel mt-8 p-7 sm:p-10">
          <h2 className="font-display text-xl font-bold tracking-tight">What to have ready</h2>
          <ul className="mt-4 grid gap-2 text-sm leading-6 text-muted-foreground sm:grid-cols-2">
            <li>The organization&rsquo;s legal name and address</li>
            <li>The ordering contact and, if different, accounts payable</li>
            <li>Your purchase-order process and preferred invoice format</li>
            <li>A resale or exemption certificate, if the organization holds one</li>
          </ul>
          <p className="mt-6 text-sm leading-6 text-muted-foreground">
            Questions before applying? Email{' '}
            <a href={`mailto:${SUPPORT.email}`} className="font-semibold text-primary">{SUPPORT.email}</a>{' '}
            or use the <Link href="/contact" className="font-semibold text-primary">contact form</Link>; a person
            replies {SUPPORT.firstReply}.
          </p>
        </section>

        <p className="mt-8 rounded-[1.2rem] border border-border bg-secondary p-5 text-xs leading-6 text-muted-foreground">
          All materials are supplied for laboratory research use only; not for human or veterinary use, and
          not for clinical or diagnostic procedures. {SUPPORT.outOfScope}
        </p>
      </section>
    </main>
  );
}
