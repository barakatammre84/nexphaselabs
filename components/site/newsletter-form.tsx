import { NEWSLETTER_COPY } from '@/lib/marketing-consent';

/**
 * The footer opt-in (owner, 16 Sep 2026). A plain form: the route records the request and
 * sends the confirmation link; nothing is subscribed until that link is opened.
 */
export function NewsletterForm({ returnTo = '/' }: { returnTo?: string }) {
  return (
    <form method="post" action="/api/newsletter" className="mt-6">
      <input type="hidden" name="intent" value="subscribe" />
      <input type="hidden" name="return_to" value={returnTo} />
      <label htmlFor="newsletter-email" className="utility-label text-white/50">
        Product news
      </label>
      <div className="mt-3 flex max-w-sm gap-2">
        <input
          id="newsletter-email"
          name="email"
          type="email"
          required
          autoComplete="email"
          placeholder="you@lab.example"
          className="h-11 min-w-0 flex-1 rounded-xl border border-white/20 bg-white/10 px-4 text-sm text-white placeholder:text-white/40 outline-none focus:border-white/60"
        />
        <button type="submit" className="h-11 shrink-0 rounded-xl bg-white px-4 text-sm font-bold text-[var(--ion-navy)]">
          Send link
        </button>
      </div>
      <p className="mt-2 max-w-sm text-xs leading-5 text-white/55">
        {NEWSLETTER_COPY.scope} You confirm by email first, and every message has an unsubscribe link.
      </p>
    </form>
  );
}
