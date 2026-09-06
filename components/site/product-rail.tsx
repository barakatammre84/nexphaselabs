import { listPublishedProducts, loadCatalog } from '@/lib/catalog-data';
import { ProductFinderDrawer } from '@/components/site/product-finder-drawer';

export async function ProductRail() {
  const products = (await loadCatalog(listPublishedProducts)).data ?? [];

  return (
    <ProductFinderDrawer
      products={products.map(({ code, name, slug }) => ({ code, name, slug }))}
    />
  );
}
