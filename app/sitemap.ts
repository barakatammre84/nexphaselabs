import type { MetadataRoute } from 'next';
import { appEnv, publicOrigin } from '@/lib/site-config';
import { listPublishedProductsForSitemap } from '@/lib/catalog-data';
import { listPublishableLotNumbers } from '@/lib/lots-public';

/**
 * The sitemap is the discovery surface for a business whose whole search
 * strategy is chemical-identity long tail. It lists ONLY what a stranger may
 * see: published products, publishable released lots, and the static pages.
 * It must never leak a quarantined, held, rejected or withdrawn lot, and it is
 * empty outside production so a staging origin never competes with the domain.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  if (appEnv() !== 'production') return [];
  const origin = publicOrigin();
  const now = new Date();
  const statics: MetadataRoute.Sitemap = [
    { url: `${origin}/`, lastModified: now, changeFrequency: 'weekly', priority: 1 },
    { url: `${origin}/catalog`, lastModified: now, changeFrequency: 'weekly', priority: 0.9 },
    { url: `${origin}/documentation`, lastModified: now, changeFrequency: 'monthly', priority: 0.7 },
    { url: `${origin}/documentation/lot-lookup`, lastModified: now, changeFrequency: 'monthly', priority: 0.7 },
    { url: `${origin}/documentation/sds`, lastModified: now, changeFrequency: 'monthly', priority: 0.5 },
    { url: `${origin}/about`, lastModified: now, changeFrequency: 'monthly', priority: 0.5 },
    { url: `${origin}/faq`, lastModified: now, changeFrequency: 'monthly', priority: 0.5 },
    { url: `${origin}/contact`, lastModified: now, changeFrequency: 'yearly', priority: 0.4 },
    { url: `${origin}/legal/terms`, lastModified: now, changeFrequency: 'yearly', priority: 0.2 },
    { url: `${origin}/legal/privacy`, lastModified: now, changeFrequency: 'yearly', priority: 0.2 },
    { url: `${origin}/legal/shipping`, lastModified: now, changeFrequency: 'yearly', priority: 0.2 },
    { url: `${origin}/legal/returns`, lastModified: now, changeFrequency: 'yearly', priority: 0.2 },
  ];
  let products: { slug: string; updatedAt: Date | null }[] = [];
  let lotNumbers: string[] = [];
  try {
    [products, lotNumbers] = await Promise.all([
      listPublishedProductsForSitemap(),
      listPublishableLotNumbers(),
    ]);
  } catch {
    // Without the database the static pages still ship; better a partial map than a 500.
  }
  return [
    ...statics,
    ...products.map((p) => ({
      url: `${origin}/catalog/${p.slug}`,
      lastModified: p.updatedAt ?? now,
      changeFrequency: 'weekly' as const,
      priority: 0.8,
    })),
    ...lotNumbers.map((n) => ({
      url: `${origin}/lots/${encodeURIComponent(n)}`,
      lastModified: now,
      changeFrequency: 'monthly' as const,
      priority: 0.6,
    })),
  ];
}
