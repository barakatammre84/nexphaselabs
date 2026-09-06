import Link from 'next/link';
export const dynamic = 'force-dynamic';
export const metadata = { title: 'Open a guest order', robots: { index: false, follow: false } };
export default async function RecoverOrderPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  return <main className="mx-auto max-w-xl px-5 py-16">
    <h1 className="page-title">Open a guest order</h1>
    <p className="mt-4 text-sm leading-6 text-muted-foreground">Use the order number and private recovery code saved from your order page. This opens only that order and its invoice, without signing in. It does not enable payment or order changes on this device.</p>
    {error && <p role="alert" className="mt-5 text-sm text-destructive">The order could not be opened. Check the number and code, or try again later. Expired or replaced codes cannot be used.</p>}
    <form method="post" action="/api/orders/recover" className="mt-6 space-y-5">
      <label className="block text-sm font-semibold">Order number<input name="number" required maxLength={30} placeholder="NX-260904-0001" autoComplete="off" className="mt-2 h-12 w-full rounded border border-border bg-background px-3" /></label>
      <label className="block text-sm font-semibold">Recovery code<input name="code" type="password" required minLength={64} maxLength={64} autoComplete="off" className="mt-2 h-12 w-full rounded border border-border bg-background px-3" /></label>
      <button className="min-h-12 bg-primary px-6 font-semibold text-primary-foreground">Open order</button>
    </form>
    <p className="mt-6 text-sm text-muted-foreground">No code saved? Use the original browser to create one. If that browser is unavailable, <Link href="/contact" className="text-primary underline">contact support</Link>. An email address alone cannot unlock private order details.</p>
  </main>;
}
