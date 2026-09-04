import { and, isNull, sql } from 'drizzle-orm';
import { getDb } from '@/db';
import { lots, productDocuments, products } from '@/db/schema';
import { isMassUnit } from '@/lib/lot-quantities';
import { parseQuantity, type QuantityUnit } from '@/lib/lot-rules';

const UG: Partial<Record<QuantityUnit, number>> = { ug: 1, mg: 1_000, g: 1_000_000, kg: 1_000_000_000 };
/** Amount in micrograms for mass units, or the raw amount for counts; null when units cannot be compared. */
function comparable(a: { amount: number; unit: QuantityUnit }, b: { amount: number; unit: QuantityUnit }): [number, number] | null {
  if (a.unit === b.unit) return [a.amount, b.amount];
  if (isMassUnit(a.unit) && isMassUnit(b.unit)) return [a.amount * (UG[a.unit] ?? 1), b.amount * (UG[b.unit] ?? 1)];
  return null;
}

/**
 * Things a person should look at. Derived on every read from the current lot
 * records; nothing is stored, so an alert disappears the moment its cause is
 * fixed. Thresholds are operational judgement, not regulation.
 */

export type LotAlertKind = 'retest_due' | 'retest_overdue' | 'quarantine_ageing' | 'low_on_hand' | 'no_sds' | 'no_manufacturer';
export type LotAlert = { kind: LotAlertKind; severity: 'warn' | 'urgent'; lotNumber: string; productCode: string; productName: string; message: string };

export const RETEST_WARNING_DAYS = 30;
export const QUARANTINE_AGEING_DAYS = 14;
export const LOW_ON_HAND_FRACTION = 0.1;

const DAY = 24 * 3600 * 1000;

export async function lotAlerts(now = new Date()): Promise<LotAlert[]> {
  const db = getDb();
  const rows = await db
    .select({
      lotNumber: lots.lotNumber,
      productCode: lots.productCode,
      productName: lots.productName,
      status: lots.status,
      receivedAt: lots.receivedAt,
      retestDate: lots.retestDate,
      quantityReceived: lots.quantityReceived,
      quantityRemaining: lots.quantityRemaining,
      manufacturerName: lots.manufacturerName,
      manufacturerAddress: lots.manufacturerAddress,
      hasSds: sql<number>`EXISTS (SELECT 1 FROM ${productDocuments} d JOIN ${products} p ON p.id = d.product_id WHERE p.code = ${lots.productCode} AND d.kind = 'sds' AND d.superseded_at IS NULL)`.mapWith(Number),
    })
    .from(lots)
    .where(and(isNull(lots.supersededById), sql`${lots.status} IN ('quarantine', 'released', 'on_hold')`));

  const out: LotAlert[] = [];
  for (const l of rows) {
    const base = { lotNumber: l.lotNumber, productCode: l.productCode, productName: l.productName };
    if (l.status === 'released' && l.retestDate) {
      const days = Math.floor((l.retestDate.getTime() - now.getTime()) / DAY);
      if (days < 0) out.push({ ...base, kind: 'retest_overdue', severity: 'urgent', message: `Retest date passed ${-days} day${days === -1 ? '' : 's'} ago. Retest or hold the lot.` });
      else if (days <= RETEST_WARNING_DAYS) out.push({ ...base, kind: 'retest_due', severity: 'warn', message: `Retest due in ${days} day${days === 1 ? '' : 's'}.` });
    }
    if (l.status === 'quarantine') {
      const days = Math.floor((now.getTime() - l.receivedAt.getTime()) / DAY);
      if (days >= QUARANTINE_AGEING_DAYS) out.push({ ...base, kind: 'quarantine_ageing', severity: 'warn', message: `In quarantine for ${days} days without a decision.` });
      if (!l.manufacturerName || !l.manufacturerAddress) out.push({ ...base, kind: 'no_manufacturer', severity: 'warn', message: 'Manufacturer name and address are missing; release will be blocked.' });
    }
    if (l.status === 'released') {
      const received = l.quantityReceived ? parseQuantity(l.quantityReceived) : null;
      const remaining = l.quantityRemaining ? parseQuantity(l.quantityRemaining) : null;
      const pair = received && remaining ? comparable(received, remaining) : null;
      if (pair && pair[0] > 0) {
        const [rec, rem] = pair;
        if (rem <= 0) out.push({ ...base, kind: 'low_on_hand', severity: 'urgent', message: 'Nothing on hand; the lot should be marked exhausted.' });
        else if (rem / rec <= LOW_ON_HAND_FRACTION) out.push({ ...base, kind: 'low_on_hand', severity: 'warn', message: `${l.quantityRemaining} on hand of ${l.quantityReceived} received.` });
      }
      if (!l.hasSds) out.push({ ...base, kind: 'no_sds', severity: 'warn', message: 'No current safety data sheet on the product; upload one on the product page.' });
    }
  }
  const rank = { urgent: 0, warn: 1 };
  return out.sort((a, b) => rank[a.severity] - rank[b.severity] || a.lotNumber.localeCompare(b.lotNumber));
}
