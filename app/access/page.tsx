import { redirect } from 'next/navigation';
import { openCheckoutEnabled } from '@/lib/site-config';

/**
 * /access was the institutional-era "research access" page and, briefly, a
 * "guest checkout — no account required" explainer left over from the tier
 * debate. Neither has a job on the storefront (Chapter 19 §19.4 #9). The URL
 * is kept for old links: with the storefront open it goes to the catalog; while
 * it is closed, to the wholesale application, which starts at sign-up.
 */
export const dynamic = 'force-dynamic';

export default function AccessPage() {
  redirect(openCheckoutEnabled() ? '/catalog' : '/account/sign-up?tier=institutional');
}
