import { listPublishedProductLinks, loadCatalog } from '@/lib/catalog-data';
import { ProductFinderDrawer } from '@/components/site/product-finder-drawer';

export async function ProductRail() {
  const products = (await loadCatalog(listPublishedProductLinks)).data ?? [];

  return <ProductFinderDrawer products={products} />;
}
