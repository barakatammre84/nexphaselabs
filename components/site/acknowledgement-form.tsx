import Link from 'next/link';
import { AlertCircle } from 'lucide-react';
import { AGE_STATEMENT, RUO_ACKNOWLEDGEMENT, RUO_VERSION, TERMS_VERSION } from '@/lib/policy';

/**
 * Shown to a signed-in account whose accepted terms or research-use
 * acknowledgement is older than the current version. Nothing tier-gated
 * renders until this is accepted.
 */
export function AcknowledgementForm({ returnTo, error }: { returnTo: string; error?: string | null }) {
  return (
    <form method="post" action="/api/account/acknowledge" className="border border-border bg-secondary p-6">
      <input type="hidden" name="return_to" value={returnTo} />
      <p className="utility-label text-primary">Updated terms</p>
      <h2 className="mt-3 font-display text-xl font-bold tracking-tight">Please confirm the current terms to continue</h2>
      <p className="mt-3 text-sm leading-6 text-muted-foreground">
        The terms of sale (version {TERMS_VERSION}) or the research-use acknowledgement (version {RUO_VERSION}) have
        changed since you last accepted them.
      </p>
      {error && (
        <p role="alert" className="mt-4 flex items-center gap-2 border border-destructive/40 bg-background p-3 text-sm">
          <AlertCircle className="size-4 text-destructive" />
          {error === 'required' ? 'All three confirmations are required.' : 'This could not be saved. Try again shortly.'}
        </p>
      )}
      <p className="mt-5 border-l-2 border-primary bg-background px-4 py-3 text-sm leading-6">{RUO_ACKNOWLEDGEMENT}</p>
      <label className="mt-4 flex items-start gap-3 text-sm">
        <input type="checkbox" name="accept_age" required className="mt-1" />
        <span>{AGE_STATEMENT}</span>
      </label>
      <label className="mt-3 flex items-start gap-3 text-sm">
        <input type="checkbox" name="accept_ruo" required className="mt-1" />
        <span>I confirm the research-use acknowledgement above.</span>
      </label>
      <label className="mt-3 flex items-start gap-3 text-sm">
        <input type="checkbox" name="accept_terms" required className="mt-1" />
        <span>
          I accept the current{' '}
          <Link href="/legal/terms" className="font-semibold text-primary">
            terms of sale
          </Link>
          .
        </span>
      </label>
      <button
        type="submit"
        className="mt-6 inline-flex h-11 items-center justify-center bg-primary px-5 text-sm font-bold text-primary-foreground hover:bg-primary/90"
      >
        Confirm and continue
      </button>
    </form>
  );
}
