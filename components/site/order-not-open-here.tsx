import Link from 'next/link';

const secondaryAction =
  'inline-flex min-h-11 items-center rounded-full border border-border bg-white px-5 text-sm font-bold text-foreground hover:border-primary hover:text-primary';

/**
 * What an order link shows in a browser that cannot open that order: typically an
 * order email opened on another device. The answer is identical whether or not the
 * order exists, so it confirms nothing; it only says how to reach the order.
 */
export function OrderNotOpenHere({ orderNumber, openCheckout }: { orderNumber: string; openCheckout: boolean }) {
  const signIn = `/account/sign-in?return_to=${encodeURIComponent(`/account/orders/${orderNumber}`)}`;
  return (
    <main className="mx-auto max-w-xl px-5 py-16">
      <h1 className="page-title">This order is not open in this browser</h1>
      <p className="mt-4 text-sm leading-6 text-muted-foreground">
        Order <span className="font-mono font-semibold text-foreground">{orderNumber}</span> can be opened from
        here{' '}
        {openCheckout
          ? 'with the recovery code saved from its order page, or by signing in if you placed it with an account.'
          : 'by signing in with the account that placed it.'}
      </p>
      <div className="mt-8 flex flex-wrap gap-3">
        {openCheckout && (
          <Link href="/account/orders/recover" className="action-primary">
            Open with a recovery code
          </Link>
        )}
        <Link href={signIn} className={openCheckout ? secondaryAction : 'action-primary'}>
          Sign in
        </Link>
      </div>
      <p className="mt-6 text-sm text-muted-foreground">
        No code and no account?{' '}
        <Link href="/contact" className="text-primary underline">
          Contact us
        </Link>{' '}
        with the order number. An email address alone cannot unlock order details.
      </p>
    </main>
  );
}
