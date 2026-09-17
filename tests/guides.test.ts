import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

const env = vi.hoisted(() => ({ APP_ENV: 'production', PUBLIC_ORIGIN: 'https://nexphaselabs.net' }) as Record<string, unknown>);
vi.mock('cloudflare:workers', () => ({ env }));
const notFound = vi.hoisted(() => vi.fn(() => { throw new Error('NEXT_NOT_FOUND'); }));
vi.mock('next/navigation', () => ({ notFound, redirect: vi.fn() }));

import { GUIDES, guideBySlug, relatedGuides } from '@/lib/guides';
import GuidesIndexPage from '@/app/documentation/guides/page';
import GuidePage, { generateMetadata, generateStaticParams } from '@/app/documentation/guides/[slug]/page';

const render = async (slug: string) =>
  renderToStaticMarkup(await GuidePage({ params: Promise.resolve({ slug }) }));

describe('guide library', () => {
  it('has unique slugs and real content in every guide', () => {
    expect(GUIDES.length).toBeGreaterThanOrEqual(5);
    expect(new Set(GUIDES.map((g) => g.slug)).size).toBe(GUIDES.length);
    for (const guide of GUIDES) {
      expect(guide.slug).toMatch(/^[a-z][a-z0-9-]+$/);
      expect(guide.sections.length).toBeGreaterThanOrEqual(3);
      expect(guide.summary.length).toBeGreaterThan(60);
      for (const section of guide.sections)
        expect([...section.paragraphs, ...(section.list ?? [])].join(' ').length).toBeGreaterThan(120);
    }
    expect(generateStaticParams()).toHaveLength(GUIDES.length);
  });

  it('resolves a slug, and offers other guides without offering itself', () => {
    const first = GUIDES[0];
    expect(guideBySlug(first.slug)?.title).toBe(first.title);
    expect(guideBySlug('nothing-here')).toBeNull();
    const related = relatedGuides(first.slug);
    expect(related.map((g) => g.slug)).not.toContain(first.slug);
    expect(related.length).toBeGreaterThan(0);
  });

  it('renders the index and each guide, and 404s on an unknown slug', async () => {
    const index = renderToStaticMarkup(React.createElement(GuidesIndexPage));
    for (const guide of GUIDES) {
      expect(index).toContain(guide.title);
      expect(index).toContain(`/documentation/guides/${guide.slug}`);
    }
    const page = await render('reading-a-certificate-of-analysis');
    expect(page).toContain('A certificate describes a lot, not a product');
    expect(page).toContain('accession number');
    expect((await generateMetadata({ params: Promise.resolve({ slug: GUIDES[0].slug }) })).title).toBe(GUIDES[0].title);
    await expect(render('not-a-guide')).rejects.toThrow('NEXT_NOT_FOUND');
  });
});

/**
 * The separation CLAUDE.md requires: reference material must not sit beside an order button,
 * because adjacency is the theory of the case in the warning letters this catalog is written
 * against. Nothing in this section may route a reader into the catalog or the cart.
 */
describe('guides stay apart from the order path', () => {
  it('links to no catalog, product or cart page from any guide', async () => {
    const pages = [
      renderToStaticMarkup(React.createElement(GuidesIndexPage)),
      ...(await Promise.all(GUIDES.map((guide) => render(guide.slug)))),
    ];
    for (const html of pages)
      for (const forbidden of ['href="/catalog', 'href="/product', 'href="/account/cart', 'Add to cart', 'Shop products'])
        expect(html).not.toContain(forbidden);
  });

  it('names no product and carries no claim about what a material does', async () => {
    const text = (
      await Promise.all(GUIDES.map((guide) => render(guide.slug)))
    )
      .join(' ')
      .replace(/<[^>]*>/g, ' ');
    // Dose and route language is excluded from this list on purpose: one guide exists partly to
    // draw the line between solvent chemistry and a reconstitution volume, and has to name both.
    const forbidden: [string, RegExp][] = [
      ['a disease or treatment claim', /\b(cures?|treatment of|therapeutic|therapy|diagnos(e|es|is)|treats?\s+(a|an|any|the)?\s*\w*\s*(disease|condition|illness|symptom|patients?))\b/i],
      ['a named disease', /\b(diabetes|obesity|cancer|alzheimer\w*|arthritis|depression|anxiety|hypertension|osteoporosis|fibrosis|ulcers?|covid)\b/i],
      ['a structure or function claim', /\b(weight loss|fat loss|appetite|satiety|muscle|anti-?aging|longevity|libido|healing|wound|inflammation|cognition)\b/i],
      ['an approved medicine by name', /\b(ozempic|wegovy|mounjaro|egrifta|saxenda|zepbound|tesamorelin|semaglutide|retatrutide)\b/i],
      ['an unevidenced manufacturing claim', /\b(gmp|pharmaceutical[- ]grade|clinical[- ]grade|endotoxin)\b/i],
      ['an absolute quality promise', /\b(guarantee[sd]?|uncompromising|99(\.\d+)?%|highest purity|purest)\b/i],
    ];
    for (const [label, pattern] of forbidden) {
      const hit = text.match(pattern);
      expect(hit ? `${label} — "${hit[0]}"` : 'clean').toBe('clean');
    }
  });

  it('states the boundary between solvent chemistry and a preparation instruction', async () => {
    const html = await render('solubility-in-laboratory-solvents');
    expect(html).toContain('Solvent solubility is chemistry');
    expect(html).toMatch(/will not find preparation instructions/i);
  });
});
