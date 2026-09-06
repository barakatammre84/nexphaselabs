'use client';
import Link from 'next/link';
import { useState } from 'react';

export function OrderRecoveryCode({ number }: { number: string }) {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ code?: string; expiresAt?: string; error?: string } | null>(null);
  return <section className="mt-6 rounded border border-border p-5">
    <h2 className="font-semibold">Save access to this order</h2>
    <p className="mt-2 text-sm text-muted-foreground">A recovery code lets you view this order and its invoice on another device. It does not create an account or require email verification. Keep it private.</p>
    <button type="button" disabled={busy} className="mt-4 min-h-11 border border-border px-4 text-sm font-semibold disabled:opacity-50" onClick={async () => {
      setBusy(true); setResult(null);
      try {
        const response = await fetch(`/api/orders/${number}/recovery-code`, { method: 'POST' });
        const data = await response.json() as NonNullable<typeof result>; setResult(response.ok ? data : { error: data.error ?? 'Could not create a code.' });
      } catch { setResult({ error: 'Could not create a code. Keep this browser open and try again.' }); }
      finally { setBusy(false); }
    }}>{busy ? 'Creating code…' : 'Create or replace recovery code'}</button>
    <p className="mt-2 text-xs text-muted-foreground">Replacing a code invalidates the old code and recovered-device sessions.</p>
    <div aria-live="polite">{result?.error && <p role="alert" className="mt-3 text-sm text-destructive">{result.error}</p>}
      {result?.code && <div className="mt-4 text-sm"><label className="block font-semibold">Recovery code<textarea readOnly value={result.code} onFocus={event => event.currentTarget.select()} className="mt-2 min-h-20 w-full break-all rounded border border-border bg-background p-3 font-mono text-sm" /></label>
        <p className="mt-2">Save this code with order {number}. Valid until {result.expiresAt?.slice(0, 10)}. It will not be shown again.</p>
        <Link href="/account/orders/recover" className="mt-3 inline-block text-primary underline">Open an order with a saved code</Link>
      </div>}
    </div>
  </section>;
}
