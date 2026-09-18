import type { Metadata } from 'next';
import Link from 'next/link';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { AlertCircle } from 'lucide-react';
import { RESEARCH_SETTINGS, latestBirthDate } from '@/lib/account-rules';
import { getAccount } from '@/lib/account-auth';
import { PENDING_COOKIE, openPendingIdentity } from '@/lib/google-signin';
import { MINIMUM_AGE } from '@/lib/policy';
import { SignupAcknowledgements } from '@/components/site/signup-acknowledgements';
import { researcherTierEnabled } from '@/lib/site-config';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Finish creating your account', robots: { index: false, follow: false } };

type Props = { searchParams: Promise<{ error?: string; codes?: string; return_to?: string; tier?: string }> };

const input = 'h-12 w-full rounded-xl border border-foreground/20 bg-background px-4 text-sm outline-none focus:border-primary';

/**
 * The step Google cannot do for us. It has told us the address is real; it has not told us the
 * person is old enough, and it cannot record that they read the research-use acknowledgement.
 * No account exists until this form comes back.
 */
export default async function CompleteAccountPage({ searchParams }: Props) {
  if (await getAccount()) redirect('/account');
  const params = await searchParams;
  const pending = await openPendingIdentity((await cookies()).get(PENDING_COOKIE)?.value ?? null);
  if (!pending) redirect('/account/sign-in?error=google_expired');

  const consumer = researcherTierEnabled();
  const wholesale = !consumer || params.tier === 'institutional';
  const errors =
    params.error === 'validation' && params.codes ? params.codes.split('|').filter(Boolean).slice(0, 10) : [];

  return (
    <main className="text-foreground">
      <section className="ion-panel mx-auto my-12 max-w-3xl px-7 py-10 sm:px-10">
        <p className="ion-kicker">Almost there</p>
        <h1 className="ion-heading mt-5 text-3xl sm:text-4xl">Finish creating your account</h1>
        <p className="mt-5 leading-8 text-muted-foreground">
          Google has verified <span className="font-semibold text-foreground">{pending.email}</span>.
          {wholesale
            ? ' Complete the details below to begin your wholesale application. Wholesale ordering requires approval.'
            : ' Confirm your age and research use, then accept the terms to create your researcher account. No wholesale application is needed.'}
        </p>

        {errors.length > 0 && (
          <ul role="alert" className="mt-6 grid gap-2 rounded-xl border border-destructive/40 bg-secondary p-4 text-sm">
            {errors.map((message) => (
              <li key={message} className="flex items-start gap-2">
                <AlertCircle className="mt-0.5 size-4 shrink-0 text-destructive" /> {message}
              </li>
            ))}
          </ul>
        )}

        {consumer && (
          <p className="mt-4 text-sm text-muted-foreground">
            {wholesale ? 'Not applying for wholesale? ' : 'Need purchase orders or net terms? '}
            <Link
              href={`/account/complete?return_to=${encodeURIComponent(params.return_to ?? '/account')}${wholesale ? '' : '&tier=institutional'}`}
              className="font-semibold text-primary underline underline-offset-4"
            >
              {wholesale ? 'Create a researcher account' : 'Apply for a wholesale account'}
            </Link>
          </p>
        )}

        <form method="post" action="/api/account/complete" className="mt-8 grid gap-6">
          <input type="hidden" name="return_to" value={params.return_to ?? '/account'} />
          <input type="hidden" name="tier" value={wholesale ? 'institutional' : 'researcher'} />

          {wholesale && <div className="flex flex-col gap-1.5">
            <label htmlFor="date_of_birth" className="text-sm font-semibold">
              Date of birth
            </label>
            <input
              id="date_of_birth"
              name="date_of_birth"
              type="date"
              required
              max={latestBirthDate()}
              autoComplete="bday"
              className={input}
            />
            <p className="text-xs leading-5 text-muted-foreground">
              Used only to check that you are at least {MINIMUM_AGE}. It is never shown or shared.
            </p>
          </div>}

          {wholesale && <div className="flex flex-col gap-1.5">
            <label htmlFor="research_setting" className="text-sm font-semibold">
              Research setting <span className="font-normal text-muted-foreground">(optional)</span>
            </label>
            <select id="research_setting" name="research_setting" defaultValue="" className="h-11 rounded-xl border border-border bg-background px-3 text-sm">
              <option value="">Choose one</option>
              {RESEARCH_SETTINGS.map((setting) => (
                <option key={setting} value={setting}>
                  {setting}
                </option>
              ))}
            </select>
          </div>}

          <SignupAcknowledgements />

          <label className="flex items-start gap-3 text-sm">
            <input type="checkbox" name="product_news" className="mt-1" />
            <span>
              <span className="font-semibold">Product news (optional)</span>
              <span className="block text-muted-foreground">
                New materials and released lots, a few times a year. Unsubscribe any time.
              </span>
            </span>
          </label>

          <div>
            <button type="submit" className="action-primary">Create my account</button>
          </div>
        </form>

        <p className="mt-8 text-sm text-muted-foreground">
          Not you?{' '}
          <Link href="/account/sign-in" className="font-semibold text-primary">Back to sign in</Link>
        </p>
      </section>
    </main>
  );
}
