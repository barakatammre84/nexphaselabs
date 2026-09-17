import type { Metadata } from 'next';
import Link from 'next/link';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { AlertCircle } from 'lucide-react';
import { RESEARCH_SETTINGS, latestBirthDate } from '@/lib/account-rules';
import { getAccount } from '@/lib/account-auth';
import { PENDING_COOKIE, openPendingIdentity } from '@/lib/google-signin';
import { NEWSLETTER_COPY } from '@/lib/marketing-consent';
import { AGE_STATEMENT, MINIMUM_AGE, RUO_ACKNOWLEDGEMENT } from '@/lib/policy';
import { researcherTierEnabled } from '@/lib/site-config';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Finish creating your account', robots: { index: false, follow: false } };

type Props = { searchParams: Promise<{ error?: string; codes?: string; return_to?: string }> };

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
  const errors =
    params.error === 'validation' && params.codes ? params.codes.split('|').filter(Boolean).slice(0, 10) : [];

  return (
    <main className="text-foreground">
      <section className="ion-panel mx-auto my-12 max-w-3xl px-7 py-10 sm:px-10">
        <p className="ion-kicker">Almost there</p>
        <h1 className="ion-heading mt-5 text-3xl sm:text-4xl">Finish creating your account</h1>
        <p className="mt-5 leading-8 text-muted-foreground">
          Google has confirmed <span className="font-semibold text-foreground">{pending.email}</span>. It cannot
          confirm your age or record the research-use acknowledgement, so we ask for those here. Nothing is created
          until you submit this form.
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

        <form method="post" action="/api/account/complete" className="mt-8 grid gap-6">
          <input type="hidden" name="return_to" value={params.return_to ?? '/account'} />

          {consumer ? (
            <fieldset className="flex flex-col gap-3">
              <legend className="text-sm font-semibold">Account type</legend>
              <label className="flex items-start gap-3 text-sm">
                <input type="radio" name="tier" value="researcher" defaultChecked className="mt-1" />
                <span>
                  <span className="font-semibold">Researcher</span>
                  <span className="block text-muted-foreground">
                    Buy from the storefront at list price, in any research setting. Laboratory research use only.
                  </span>
                </span>
              </label>
              <label className="flex items-start gap-3 text-sm">
                <input type="radio" name="tier" value="institutional" className="mt-1" />
                <span>
                  <span className="font-semibold">Wholesale account</span>
                  <span className="block text-muted-foreground">
                    A university, CRO or company buying on purchase order with net terms. A person approves the
                    application before ordering.
                  </span>
                </span>
              </label>
            </fieldset>
          ) : (
            <input type="hidden" name="tier" value="institutional" />
          )}

          <div className="flex flex-col gap-1.5">
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
          </div>

          <div className="flex flex-col gap-1.5">
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
          </div>

          <div className="rounded-[1.4rem] border border-border bg-secondary p-5">
            <p className="utility-label text-primary">Research-use acknowledgement</p>
            <p className="mt-3 text-sm leading-6">{RUO_ACKNOWLEDGEMENT}</p>
            <label className="mt-4 flex items-start gap-3 text-sm">
              <input type="checkbox" name="accept_age" required className="mt-1" />
              <span>{AGE_STATEMENT}</span>
            </label>
            <label className="mt-3 flex items-start gap-3 text-sm">
              <input type="checkbox" name="accept_ruo" required className="mt-1" />
              <span>I confirm the acknowledgement above.</span>
            </label>
            <label className="mt-3 flex items-start gap-3 text-sm">
              <input type="checkbox" name="accept_terms" required className="mt-1" />
              <span>
                I accept the{' '}
                <Link href="/legal/terms" className="font-semibold text-primary">terms of sale</Link>.
              </span>
            </label>
          </div>

          <label className="flex items-start gap-3 text-sm">
            <input type="checkbox" name="product_news" className="mt-1" />
            <span>
              <span className="font-semibold">Product news (optional)</span>
              <span className="block text-muted-foreground">{NEWSLETTER_COPY.scope} Unsubscribe any time.</span>
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
