import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowRight, FileQuestion, Headphones, Mail, PackageSearch } from 'lucide-react';
import { ResearchNoticeBlock } from '@/components/site/research-notice';

export const metadata: Metadata = {
  title: 'Contact',
  description: 'Contact NexPhase Labs for product, lot-documentation, account, or order support.',
};

const supportPaths = [
  {
    icon: FileQuestion,
    title: 'Product or lot records',
    copy: 'Include the catalog number or lot number so we can locate the relevant record quickly.',
    href: '/documentation/lot-lookup',
    label: 'Search lot records',
  },
  {
    icon: PackageSearch,
    title: 'Order support',
    copy: 'Signed-in buyers can review order status and keep the order number attached to the request.',
    href: '/account/orders',
    label: 'View your orders',
  },
  {
    icon: Headphones,
    title: 'Account and catalog help',
    copy: 'Use the support button on this page for a conversation about access, navigation, or product availability.',
    href: '/faq',
    label: 'Browse common questions',
  },
] as const;

export default function ContactPage() {
  return (
    <main className="text-foreground">
      <section className="mx-auto max-w-[1280px] px-4 pb-12 pt-3 sm:px-6">
        <div className="ion-hero grid gap-10 p-8 sm:p-12 lg:grid-cols-[1fr_0.8fr] lg:items-center lg:p-16">
          <div>
            <span className="inline-flex rounded-full bg-white/10 px-3 py-2 text-xs font-bold text-blue-200">NexPhase support</span>
            <h1 className="mt-6 max-w-3xl font-display text-[clamp(3rem,6vw,5.5rem)] font-extrabold leading-[0.98] tracking-[-0.065em]">A real team is here to help.</h1>
            <p className="mt-6 max-w-2xl text-lg leading-8 text-white/70">Get help locating a product record, understanding account access, or resolving an order question. We do not provide medical or experimental-use guidance.</p>
          </div>
          <div className="rounded-[1.6rem] border border-white/15 bg-white/10 p-6 backdrop-blur">
            <Mail className="size-7 text-blue-200" />
            <p className="mt-5 text-sm font-bold text-white/60">Email support</p>
            <a href="mailto:research@nexphaselabs.net" className="mt-2 block break-all font-display text-xl font-extrabold text-white">research@nexphaselabs.net</a>
            <p className="mt-4 text-sm leading-6 text-white/65">For the fastest routing, include a catalog number, lot number, or order number when one is available.</p>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-[1280px] px-4 py-12 sm:px-6">
        <div className="mb-8 max-w-2xl">
          <span className="ion-kicker">Choose the fastest path</span>
          <h2 className="ion-heading mt-5 text-4xl sm:text-5xl">Start with what you need.</h2>
        </div>
        <div className="grid gap-5 md:grid-cols-3">
          {supportPaths.map(({ icon: Icon, title, copy, href, label }) => (
            <article key={title} className="ion-panel flex flex-col p-7">
              <span className="grid size-11 place-items-center rounded-full bg-secondary text-primary"><Icon className="size-5" /></span>
              <h3 className="mt-6 font-display text-2xl font-extrabold text-[var(--ion-navy)]">{title}</h3>
              <p className="mt-3 flex-1 text-sm leading-6 text-muted-foreground">{copy}</p>
              <Link href={href} className="mt-7 inline-flex items-center gap-2 text-sm font-extrabold text-primary">{label} <ArrowRight className="size-4" /></Link>
            </article>
          ))}
        </div>
      </section>
      <ResearchNoticeBlock />
    </main>
  );
}
