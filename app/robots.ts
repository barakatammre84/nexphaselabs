import type { MetadataRoute } from 'next';
import { appEnv, publicOrigin } from '@/lib/site-config';

/**
 * Reviewed against the current route structure (chapter 1 §1.3).
 *
 * Out: the staff and customer areas, the API, and the query-string forms of the
 * public pages — `/catalog?q=…&class=…&sort=…` is a search-results page and
 * `/catalog/<slug>?cart=…` is a post-action flag, and indexing either produces
 * duplicates of a page that is already in the sitemap.
 *
 * In, deliberately: `/product/<slug>`, the old WordPress product URLs. They are
 * 301s and 410s now, and a crawler has to be allowed to fetch them to learn
 * that. Blocking them would leave the old URLs indexed indefinitely.
 *
 * Non-production disallows everything; the worker also sends X-Robots-Tag on
 * every response there (lib/environment-gate.ts).
 */
export default function robots(): MetadataRoute.Robots {
  if (appEnv() !== 'production') return { rules: [{ userAgent: '*', disallow: '/' }] };
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: [
          '/manage',
          '/staff',
          '/api',
          '/account',
          '/catalog?',
          '/catalog/*?',
          '/documentation/lot-lookup?',
        ],
      },
    ],
    sitemap: `${publicOrigin()}/sitemap.xml`,
  };
}
