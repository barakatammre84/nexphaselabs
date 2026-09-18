import Link from 'next/link';
import { MINIMUM_AGE, RUO_ACKNOWLEDGEMENT } from '@/lib/policy';

/** One explicit combined affirmation; the server records age and RUO separately. */
export function SignupAcknowledgements() {
  return (
    <div className="space-y-4 rounded-xl border border-border p-4">
      <label className="flex items-start gap-3 text-sm leading-6">
        <input
          type="checkbox"
          name="accept_research_age"
          required
          aria-describedby="signup-research-acknowledgement"
          className="mt-1.5 size-4 shrink-0"
        />
        <span>
          I am at least {MINIMUM_AGE} and agree to the research-use acknowledgement.
          These materials are for laboratory research only, not for use in humans or animals.
        </span>
      </label>
      <details className="text-sm">
        <summary className="cursor-pointer font-semibold text-primary">
          Read the research-use acknowledgement
        </summary>
        <p id="signup-research-acknowledgement" className="mt-3 leading-6 text-muted-foreground">
          {RUO_ACKNOWLEDGEMENT}
        </p>
      </details>
      <label className="flex items-start gap-3 text-sm leading-6">
        <input type="checkbox" name="accept_terms" required className="mt-1.5 size-4 shrink-0" />
        <span>
          I accept the{' '}
          <Link href="/legal/terms" className="font-semibold text-primary">terms of sale</Link>
          {' '}and{' '}
          <Link href="/legal/privacy" className="font-semibold text-primary">privacy policy</Link>.
        </span>
      </label>
    </div>
  );
}