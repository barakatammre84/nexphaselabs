import { and, asc, eq, sql } from 'drizzle-orm';
import { getDb } from '@/db';
import { lots, products, productVariants } from '@/db/schema';
import { lotSuppliesPack } from '@/lib/lot-quantities';
import { publishableLot } from '@/lib/lots-public';

export function purchasabilityIssues(price: number | null, packSize: string, stock: { quantityRemaining: string | null; retestDate: Date | null; containerSize?: string | null }[], now = new Date()): string[] {
  const issues: string[] = [];
  if (price === null || !Number.isSafeInteger(price) || price <= 0) issues.push('Approved public price needed');
  if (!stock.length) issues.push('No released, publishable lot (released + named lab, accession and standard)');
  else if (!stock.some(lot => (!lot.retestDate || lot.retestDate.getTime() > now.getTime()) && lotSuppliesPack(lot, packSize)))
    issues.push('No usable quantity for one pack, or retest due');
  return issues;
}

/** Bounded catalog scan; readiness is indicative, not a reservation or QC release. */
export async function catalogReadiness() {
  const db = getDb();
  const rows = await db.select({ product: products, variant: productVariants })
    .from(productVariants).innerJoin(products, eq(products.id, productVariants.productId))
    .where(and(eq(products.visibility, 'published'), eq(productVariants.active, true)))
    .orderBy(asc(productVariants.sku)).limit(501);
  const codes = [...new Set(rows.slice(0, 500).map(r => r.product.code))];
  const stock = codes.length ? await db.select({ productCode: lots.productCode, quantityRemaining: lots.quantityRemaining, retestDate: lots.retestDate, containerSize: lots.containerSize })
    .from(lots).where(and(publishableLot(), sql`${lots.productCode} IN (SELECT value FROM json_each(${JSON.stringify(codes)}))`)).limit(5001) : [];
  const truncated = rows.length > 500 || stock.length > 5000;
  return { truncated, rows: rows.slice(0, 500).map(({ product, variant }) => ({
    code: product.code, name: product.name, sku: variant.sku, packSize: variant.quantity,
    priceCents: variant.listPriceCents,
    issues: purchasabilityIssues(variant.listPriceCents, variant.quantity, stock.filter(l => l.productCode === product.code)),
  })) };
}
