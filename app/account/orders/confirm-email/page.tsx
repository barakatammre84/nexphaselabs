import type { Metadata } from 'next';
import Link from 'next/link';
import { ORDER_NUMBER_PATTERN } from '@/lib/order-rules';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = {
  title: 'Email confirmation',
  robots: { index: false, follow: false },
};

type Props = {
  searchParams: Promise<{ order?: string; verify?: string }>;
};

/** Why a confirmation link could not be used, in the words a customer needs. */
function problemFor(reason: string | undefined): { title: string; body: string } {
  switch (reason) {
    case 'expired':
      return {
        title: 'This confirmation link has expired',
        body: 'Confirmation links last 30 days. Open your order in the browser you placed it from to send a new one, or contact us with your order number.',
      };
    case 'used':
      return {
        title: 'This confirmation link has already been used',
        body: 'If you confirmed this address before, there is nothing more to do. Otherwise contact us with your order number.',
      };
    case 'unavailable':
      return {
        title: 'Email confirmation is unavailable right now',
        body: 'Nothing was changed. Try the link from your email again in a few minutes.',
      };
    default:
      return {
        title: 'We could not recognise this confirmation link',
        body: 'Copy the whole link from the email, or open your order in the browser you placed it from to send a new one.',
      };
  }
}

const secondaryAction =
  'inline-flex min-h-11 items-center rounded-full border border-border bg-white px-5 text-sm font-bold text-foreground hover:border-primary hover:text-primary';

/** Where the order email-confirmation link lands. Needs no session; see app/api/orders/verify/route.ts. */
export default async function ConfirmEmailPage({ searchParams }: Props) {
  const { order, verify } = await searchParams;
  // Only a real order number is ever shown; anything else in the address bar is ignored.
  const orderNumber = order && ORDER_NUMBER_PATTERN.test(order) ? order : null;

  if (orderNumber) {
    return (
      <main className="mx-auto max-w-xl px-5 py-16">
        <h1 className="page-title">Email confirmed</h1>
        <p className="mt-4 text-sm leading-6 text-muted-foreground">
          Updates for order{' '}
          <span className="font-mono font-semibold text-foreground">{orderNumber}</span> will go to
          this address. There is nothing else to do.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Link href={`/account/orders/${orderNumber}`} className="action-primary">
            Open the order
          </Link>
          <Link href="/account/orders/recover" className={secondaryAction}>
            Open with a recovery code
          </Link>
        </div>
        <p className="mt-4 text-xs leading-5 text-muted-foreground">
          The order opens in the browser you placed it from. On any other device, use the recovery
          code saved from the order page.
        </p>
      </main>
    );
  }

  const problem = problemFor(verify);
  return (
    <main className="mx-auto max-w-xl px-5 py-16">
      <h1 className="page-title">{problem.title}</h1>
      <p className="mt-4 text-sm leading-6 text-muted-foreground">{problem.body}</p>
      <div className="mt-8 flex flex-wrap gap-3">
        <Link href="/contact" className="action-primary">
          Contact us
        </Link>
        <Link href="/account/orders/recover" className={secondaryAction}>
          Open with a recovery code
        </Link>
      </div>
    </main>
  );
}
