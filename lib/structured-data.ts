import { ENTITY } from '@/lib/entity';
import { publicOrigin } from '@/lib/site-config';
import { SUPPORT } from '@/lib/support';

/**
 * Organization and WebSite structured data for the whole site (owner, 16 Sep 2026).
 * Deliberately no Offer, Product, AggregateRating or SearchAction: prices render only
 * to signed-in accounts, reviews do not exist here, and nothing in this file may read
 * as an offer to the general public. No street address either — the registered address
 * is a settings fact for documents, not a public listing.
 */
export function organizationJsonLd() {
  const url = publicOrigin();
  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Organization',
        '@id': `${url}/#organization`,
        name: ENTITY.tradingName,
        legalName: ENTITY.legalName,
        url,
        logo: `${url}/apple-touch-icon.png`,
        email: SUPPORT.email,
        address: {
          '@type': 'PostalAddress',
          addressLocality: ENTITY.city,
          addressRegion: ENTITY.region,
          addressCountry: 'US',
        },
        contactPoint: [
          {
            '@type': 'ContactPoint',
            contactType: 'customer support',
            email: SUPPORT.email,
            availableLanguage: 'English',
          },
        ],
      },
      {
        '@type': 'WebSite',
        '@id': `${url}/#website`,
        url,
        name: ENTITY.tradingName,
        publisher: { '@id': `${url}/#organization` },
      },
    ],
  };
}

/** Serialised for a script element: a "<" in any value cannot close the tag. */
export function jsonLdScript(data: unknown): string {
  return JSON.stringify(data).replace(/</g, String.fromCharCode(92) + 'u003c');
}
