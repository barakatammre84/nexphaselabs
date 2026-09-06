import { and, asc, eq, isNull, sql } from 'drizzle-orm';
import { getDb } from '@/db';
import { lots, products, productVariants } from '@/db/schema';
import { pickFromLot } from '@/lib/lot-quantities';

export function purchasabilityIssues(price: number | null, packSize: string, stock: { quantityRemaining: string | null; retestDate: Date | null }[], now = new Date()): string[] {
  const issues: string[] = [];
  if (price === null || !Number.isSafeInteger(price) || price <= 0) issues.push('Approved public price needed');
  if (!stock.length) issues.push('No released lot');
  else if (!stock.some(lot => (!lot.retestDate || lot.retestDate.getTime() > now.getTime()) && pickFromLot(lot.quantityRemaining, packSize, 1).ok))
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
  const stock = codes.length ? await db.select({ productCode: lots.productCode, quantityRemaining: lots.quantityRemaining, retestDate: lots.retestDate })
    .from(lots).where(and(eq(lots.status, 'released'), isNull(lots.supersededById), sql`${lots.productCode} IN (SELECT value FROM json_each(${JSON.stringify(codes)}))`)).limit(5001) : [];
  const truncated = rows.length > 500 || stock.length > 5000;
  return { truncated, rows: rows.slice(0, 500).map(({ product, variant }) => ({
    code: product.code, name: product.name, sku: variant.sku, packSize: variant.quantity,
    priceCents: variant.listPriceCents,
    issues: purchasabilityIssues(variant.listPriceCents, variant.quantity, stock.filter(l => l.productCode === product.code)),
  })) };
}
