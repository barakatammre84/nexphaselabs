import { loadCatalog } from '@/lib/catalog-data';
import { listStorefrontProductLinks } from '@/lib/storefront';
import { ProductFinderDrawer } from '@/components/site/product-finder-drawer';

export async function ProductRail() {
  const products = (await loadCatalog(listStorefrontProductLinks)).data ?? [];

  return <ProductFinderDrawer products={products} />;
}
