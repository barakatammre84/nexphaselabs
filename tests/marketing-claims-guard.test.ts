import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

const env = vi.hoisted(() => ({
  APP_ENV: 'production',
  PUBLIC_ORIGIN: 'https://nexphaselabs.net',
  POLICIES_COUNSEL_REVIEWED: 'true',
  OPEN_CHECKOUT_ENABLED: 'true',
  ACCOUNT_REQUIRED: 'true',
  RESEARCHER_TIER_ENABLED: 'true',
}) as Record<string, unknown>);
vi.mock('cloudflare:workers', () => ({ env }));
vi.mock('next/headers', () => ({ cookies: async () => ({ get: () => undefined }) }));
vi.mock('next/navigation', () => ({ redirect: vi.fn(), notFound: vi.fn() }));
vi.mock('next/image', () => ({
  default: ({ alt, src }: { alt?: string; src?: string }) => React.createElement('img', { alt, src: String(src ?? '') }),
}));
vi.mock('@/lib/catalog-data', () => ({
  loadCatalog: async (read: () => Promise<unknown>) => ({ data: await read(), unavailable: false }),
  groupByClass: () => new Map(),
}));
vi.mock('@/lib/storefront', () => ({ listStorefrontProducts: async () => [], visibleStock: () => null }));
vi.mock('@/lib/classes', () => ({ listActiveClasses: async () => [] }));
vi.mock('@/lib/visibility', () => ({ currentViewer: async () => ({ account: null, visibility: { pricing: 'none', availability: false } }) }));

import { GUIDES } from '@/lib/guides';
import GuidesIndexPage from '@/app/documentation/guides/page';
import GuidePage from '@/app/documentation/guides/[slug]/page';
import HomePage from '@/app/page';
import AboutPage from '@/app/about/page';
import WholesalePage from '@/app/wholesale/page';
import CommunityGuidelinesPage from '@/app/legal/community-guidelines/page';

/**
 * A guard on the marketing surfaces, added when the copy was deliberately made more confident
 * (owner, 16 Sep 2026: "lean toward their confidence"). Confidence here has to come from facts a
 * reader can check, never from a claim about what the material does. Each pattern below is
 * language FDA has quoted in warning letters to peptide sellers, or a claim we cannot evidence.
 */
const FORBIDDEN: [label: string, pattern: RegExp][] = [
  ['a disease or treatment claim', /\b(cures?|treatment of|therapeutic|therapy|diagnos(e|es|is)|treats?\s+(a|an|any|the)?\s*\w*\s*(disease|condition|illness|symptom|patients?))\b/i],
  ['a named disease', /\b(diabetes|obesity|cancer|alzheimer\w*|arthritis|depression|anxiety|hypertension|osteoporosis|fibrosis|ulcers?|covid)\b/i],
  ['a structure or function claim', /\b(weight loss|fat loss|appetite|satiety|muscle|recovery|anti-?aging|longevity|libido|healing|wound|inflammation|cognition|energy levels)\b/i],
  ['a human dose or route', /\b(dosage|dosing|mg\/kg|per kilogram|reconstitut\w*|subcutaneous|intramuscular|injection|syringe|insulin unit)\b/i],
  ['an approved medicine by name', /\b(ozempic|wegovy|mounjaro|egrifta|saxenda|zepbound)\b/i],
  ['an unevidenced manufacturing claim', /\b(gmp|pharmaceutical[- ]grade|clinical[- ]grade|sterile|endotoxin)\b/i],
  ['an absolute quality promise', /\b(guarantee[sd]?|uncompromising|99(\.\d+)?%|highest purity|purest)\b/i],
  ['an approval claim', /\bfda[- ]approved\b/i],
];

/**
 * A sentence that refuses to do a thing is not a claim to do it: the research-use boundary on
 * every page says in terms that we do not provide dosing guidance, and that sentence must stay.
 * Those sentences are dropped before the scan; everything else is held to the list above.
 */
const DISCLAIMS =
  /\b(we (do not|don't|never|decline|cannot|refuse|would only note)|does not provide|do not provide|do not publish|is not something|will not find|not for human|not for veterinary|no dosing|not permitted|prohibit\w*|declin\w*|refus\w*)\b/i;

const strip = (html: string) =>
  html
    .replace(/<[^>]*>/g, ' ')
    .replace(/&[a-z]+;/gi, ' ')
    .split(/(?<=[.!?])\s+/)
    .filter((sentence) => !DISCLAIMS.test(sentence))
    .join(' ');

async function surfaces(): Promise<[string, string][]> {
  return [
    ['home', strip(renderToStaticMarkup(await HomePage()))],
    ['about', strip(renderToStaticMarkup(React.createElement(AboutPage)))],
    ['wholesale', strip(renderToStaticMarkup(React.createElement(WholesalePage)))],
    ['guides index', strip(renderToStaticMarkup(React.createElement(GuidesIndexPage)))],
    ...(await Promise.all(
      GUIDES.map(async (guide) => [
        `guide ${guide.slug}`,
        strip(renderToStaticMarkup(await GuidePage({ params: Promise.resolve({ slug: guide.slug }) }))),
      ] as [string, string]),
    )),
  ];
}

describe('marketing surfaces make no claim we cannot evidence', () => {
  it('carries none of the language that draws warning letters', async () => {
    for (const [page, text] of await surfaces())
      for (const [label, pattern] of FORBIDDEN) {
        const hit = text.match(pattern);
        expect(hit ? `${page}: ${label} — "${hit[0]}"` : `${page}: clean`).toBe(`${page}: clean`);
      }
  });

  it('still says the concrete, checkable things that make the case', async () => {
    // Raw markup here, not the filtered scan text: this asserts what the page actually shows.
    const home = renderToStaticMarkup(await HomePage()).replace(/<[^>]*>/g, ' ').replace(/&[a-z]+;/gi, ' ');
    // The differentiator: the laboratory is named and its own reference is published.
    expect(home).toMatch(/testing laboratory is named/i);
    expect(home).toMatch(/Check the result with them, not with us/i);
    expect(home).toMatch(/A person releases each lot/i);
    expect(home).toMatch(/Everything we claim is on a document you can check/i);
    // Purity is stated with its method, which is the safe half of a purity claim.
    expect(home).toMatch(/Purity by HPLC, with the method printed beside the result/i);
    // Research-use boundary still renders above the footer.
    expect(home).toMatch(/not human or veterinary use/i);
  });
});

describe('community guidelines', () => {
  it('names the prohibited content plainly and says what we do about it', () => {
    const html = renderToStaticMarkup(React.createElement(CommunityGuidelinesPage));
    for (const phrase of [
      'laboratory research',
      'per kilogram of body weight',
      'before-and-after imagery',
      'Naming an approved medicine',
      'we report it',
      'refuse or cancel an order',
    ])
      expect(html).toContain(phrase);
  });

  it('claims no partner relationship we do not have, and binds the ones we do', () => {
    const html = renderToStaticMarkup(React.createElement(CommunityGuidelinesPage));
    expect(html).toContain('href="/legal/affiliate-terms"');
    expect(html).toContain('must disclose clearly');
    expect(html).toContain('We do not pay for reviews');
    expect(html).toContain('Nobody else speaks for us');
  });
});
