import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { localD1 } from './helpers/local-d1';
const { env } = vi.hoisted(() => ({ env: {} as { DB?: D1Database } }));
vi.mock('cloudflare:workers', () => ({ env }));
import { getDb } from '@/db';
import { products, suppliers } from '@/db/schema';
import { createPurchaseOrder, getExpectedReceipt, getPurchaseOrder, getSupplier, openExpectedReceipts, setSupplierQualification, transitionPurchaseOrder, updateSupplier } from '@/lib/procurement';
import { correctLot, createLot, getLot, lotToIntakeInput } from '@/lib/lots-admin';
import { validateLotCorrection, validateLotIntake } from '@/lib/lot-rules';
import { validateSupplier } from '@/lib/procurement-rules';
import type { StaffPrincipal } from '@/lib/staff-auth';

let local: ReturnType<typeof localD1>;
const staff = { id: 'staff_test', name: 'Synthetic purchasing', role: 'admin' } as StaffPrincipal;
const input = { supplierId: 'sup_test', orderedOn: null, expectedOn: null, freightCents: 101, dutyCents: 0, supplierReference: null, note: null, lines: [{ productCode: 'NPL-001', quantity: '10 mg', lineCostCents: 1000 }] };
const count = (table: string) => local.sqlite.prepare(`SELECT count(*) AS n FROM ${table}`).get()!.n;
const supplier = async () => (await getSupplier('sup_test'))!.supplier;
async function draft() {
  const result = await createPurchaseOrder(input, staff);
  if (!result.ok) throw new Error(result.error);
  return (await getPurchaseOrder(result.poNumber))!;
}
async function sent() {
  const detail = await draft();
  expect((await transitionPurchaseOrder(detail.order, 'sent', staff, null)).ok).toBe(true);
  return (await getPurchaseOrder(detail.order.poNumber))!;
}
function intake(number: string, quantity = '5 mg') {
  const value = validateLotIntake({ lotNumber: number, productCode: 'NPL-001', quantityReceived: quantity, receivedAt: '2026-09-04' });
  if (!value.ok) throw new Error(JSON.stringify(value));
  return value.value;
}
beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date('2026-09-04T12:00:00Z'));
  local = localD1(); env.DB = local.binding;
  await getDb().insert(suppliers).values({ id: 'sup_test', name: 'Synthetic supplier', qualificationStatus: 'qualified', createdBy: staff.id });
  await getDb().insert(products).values({ id: 'product1', code: 'NPL-001', slug: 'synthetic-product', name: 'Synthetic product', formalName: 'Test', chemicalClass: 'Test', casNumber: '50-00-0', molecularFormula: 'Test', molecularWeight: 'Test', purity: 'Test', form: 'Test', saltForm: 'Test', storageSolid: 'Test', storageStock: 'Test', stability: 'Test', shipping: 'Test', description: 'Synthetic fixture', visibility: 'draft' });
});
afterEach(() => { local.sqlite.close(); delete env.DB; vi.useRealTimers(); });

describe('purchasing and receiving transactions', () => {
  it('conserves landed cost across partial receipts and never releases stock implicitly', async () => {
    const po = await sent(); const line = po.lines[0].id;
    expect((await createLot(intake('LOCAL-A'), staff, await getExpectedReceipt(line))).ok).toBe(true);
    expect((await getPurchaseOrder(po.order.poNumber))!.order.status).toBe('partially_received');
    expect((await createLot(intake('LOCAL-B'), staff, await getExpectedReceipt(line))).ok).toBe(true);
    expect((await getPurchaseOrder(po.order.poNumber))!.order.status).toBe('received');
    expect(local.sqlite.prepare('SELECT sum(cost_cents) AS n FROM lots').get()!.n).toBe(1101);
    expect(local.sqlite.prepare("SELECT count(*) AS n FROM lots WHERE status = 'quarantine'").get()!.n).toBe(2);
    expect(count('lot_movements')).toBe(2);
    expect(await getExpectedReceipt(line)).toBeNull();
  });
  it.each(["UPDATE suppliers SET qualification_status = 'suspended'", 'UPDATE suppliers SET active = 0', "UPDATE suppliers SET name = 'Changed supplier'", "UPDATE products SET visibility = 'withdrawn'", "UPDATE products SET name = 'Changed identity'"])(
    'refuses changed approval or identity at PO creation without orphan lines: %s', async (change) => {
      local.beforeNextBatch(() => local.sqlite.exec(change));
      expect((await createPurchaseOrder(input, staff)).ok).toBe(false);
      expect(count('purchase_orders')).toBe(0); expect(count('purchase_order_lines')).toBe(0); expect(count('purchase_order_events')).toBe(0);
    });
  it.each(["UPDATE suppliers SET qualification_status = 'suspended'", 'UPDATE suppliers SET active = 0', "UPDATE products SET visibility = 'withdrawn'"])(
    'refuses sending a draft after a disqualifying change: %s', async (change) => {
      const po = await draft(); local.beforeNextBatch(() => local.sqlite.exec(change));
      expect((await transitionPurchaseOrder(po.order, 'sent', staff, null)).ok).toBe(false);
      expect((await getPurchaseOrder(po.order.poNumber))!.order.status).toBe('draft');
      expect(count('purchase_order_events')).toBe(1);
    });
  it('does not let a stale supplier form overwrite a newer edit', async () => {
    const stale = await supplier();
    const a = validateSupplier({ name: stale.name, contactName: 'First editor' });
    const b = validateSupplier({ name: stale.name, contactName: 'Second editor' });
    if (!a.ok || !b.ok) throw new Error('Invalid fixture');
    expect((await updateSupplier(stale, a.value, staff)).ok).toBe(true);
    expect((await updateSupplier(stale, b.value, staff)).ok).toBe(false);
    expect((await supplier()).contactName).toBe('First editor'); expect(count('supplier_events')).toBe(1);
  });
  it('requires re-review before qualification if supplier evidence changed', async () => {
    local.sqlite.exec("UPDATE suppliers SET qualification_status = 'unqualified'");
    const stale = await supplier();
    const value = validateSupplier({ name: stale.name, notes: 'New evidence' });
    if (!value.ok) throw new Error('Invalid fixture');
    await updateSupplier(stale, value.value, staff);
    expect((await setSupplierQualification(stale, 'qualified', 'Reviewed old evidence', staff)).ok).toBe(false);
    expect((await supplier()).qualificationStatus).toBe('unqualified');
  });
  it('allows cancelling a draft even when its supplier is suspended', async () => {
    const po = await draft(); local.sqlite.exec("UPDATE suppliers SET qualification_status = 'suspended'");
    expect((await transitionPurchaseOrder(po.order, 'cancelled', staff, 'Not proceeding')).ok).toBe(true);
    expect((await getPurchaseOrder(po.order.poNumber))!.lines[0].closedAt).not.toBeNull();
  });
  it('rejects a duplicate receipt and rolls back all receipt writes on audit failure', async () => {
    const po = await sent(); const expected = await getExpectedReceipt(po.lines[0].id);
    expect((await createLot(intake('LOCAL-A'), staff, expected)).ok).toBe(true);
    expect((await createLot(intake('LOCAL-B'), staff, expected)).ok).toBe(false);
    local.sqlite.exec("CREATE TRIGGER fail_receipt BEFORE INSERT ON lot_movements BEGIN SELECT RAISE(ABORT, 'test failure'); END");
    await expect(createLot(intake('LOCAL-C'), staff, await getExpectedReceipt(po.lines[0].id))).rejects.toThrow();
    expect(count('lots')).toBe(1); expect(count('lot_movements')).toBe(1);
    expect((await getExpectedReceipt(po.lines[0].id))!.receivedQuantity).toBe('5 mg');
  });
  it('rechecks allocated cost when an earlier lot cost changes during intake', async () => {
    const po = await sent(); const line = po.lines[0].id;
    await createLot(intake('LOCAL-A'), staff, await getExpectedReceipt(line));
    const stale = await getExpectedReceipt(line);
    local.beforeNextBatch(() => local.sqlite.exec('UPDATE lots SET cost_cents = 700'));
    expect((await createLot(intake('LOCAL-B'), staff, stale)).ok).toBe(false);
    expect(count('lots')).toBe(1);
    expect((await createLot(intake('LOCAL-B'), staff, await getExpectedReceipt(line))).ok).toBe(true);
    expect(local.sqlite.prepare('SELECT sum(cost_cents) AS n FROM lots').get()!.n).toBe(1101);
  });
  it('reads expected receipts for more than 100 open POs within database parameter limits', async () => {
    for (let i = 0; i < 105; i++) {
      local.sqlite.prepare("INSERT INTO purchase_orders(id, po_number, supplier_id, supplier_name, status, created_by) VALUES (?, ?, 'sup_test', 'Synthetic supplier', 'sent', 'staff_test')").run(`po${i}`, `PO-260904-${String(i).padStart(4, '0')}`);
      local.sqlite.prepare("INSERT INTO purchase_order_lines(id, purchase_order_id, line_no, product_code, product_name, quantity, line_cost_cents) VALUES (?, ?, 1, 'NPL-001', 'Synthetic', '10 mg', 100)").run(`line${i}`, `po${i}`);
    }
    expect(await openExpectedReceipts()).toHaveLength(105);
    expect((await getExpectedReceipt('line104'))!.lineId).toBe('line104');
  });
  it.each([false, true])('refuses a product withdrawn during intake (linked PO: %s)', async (linked) => {
    const expected = linked ? await getExpectedReceipt((await sent()).lines[0].id) : null;
    local.beforeNextBatch(() => local.sqlite.exec("UPDATE products SET visibility = 'withdrawn'"));
    expect((await createLot(intake('LOCAL-A'), staff, expected)).ok).toBe(false);
    expect(count('lots')).toBe(0); expect(count('lot_movements')).toBe(0);
    if (expected) expect((await getExpectedReceipt(expected.lineId))!.receivedCount).toBe(0);
  });
  it('refuses a stale receipt after cancellation', async () => {
    const po = await sent(); const expected = await getExpectedReceipt(po.lines[0].id);
    await transitionPurchaseOrder(po.order, 'cancelled', staff, 'Cancelled before arrival');
    expect((await createLot(intake('LOCAL-A'), staff, expected)).ok).toBe(false);
    expect(count('lots')).toBe(0);
  });
  it('keeps lot corrections, received quantities and order reopening consistent', async () => {
    const po = await sent();
    await createLot(intake('LOCAL-A', '10 mg'), staff, await getExpectedReceipt(po.lines[0].id));
    const lot = (await getLot('LOCAL-A'))!;
    const v = validateLotCorrection(lotToIntakeInput(lot), { quantityReceived: '8 mg' }, 'Corrected receiving measurement');
    if (!v.ok) throw new Error(JSON.stringify(v));
    expect((await correctLot(lot, v, staff)).ok).toBe(true);
    const detail = (await getPurchaseOrder(po.order.poNumber))!;
    expect(detail.order.status).toBe('partially_received'); expect(detail.lines[0].receivedQuantity).toBe('8 mg');
    expect(detail.lines[0].closedAt).toBeNull(); expect(count('lots')).toBe(2);
    expect((await getExpectedReceipt(po.lines[0].id))!.allocatedCents).toBe(1101);
  });
  it('does not reopen a line if staff cancel its order during a correction', async () => {
    const po = await sent();
    await createLot(intake('LOCAL-A'), staff, await getExpectedReceipt(po.lines[0].id));
    const lot = (await getLot('LOCAL-A'))!;
    const v = validateLotCorrection(lotToIntakeInput(lot), { quantityReceived: '4 mg' }, 'Corrected receiving measurement');
    if (!v.ok) throw new Error(JSON.stringify(v));
    local.beforeNextBatch(() => local.sqlite.exec("UPDATE purchase_orders SET status = 'cancelled', last_transition_id = 'cancel'; UPDATE purchase_order_lines SET closed_at = unixepoch()"));
    expect((await correctLot(lot, v, staff)).ok).toBe(false);
    expect(count('lots')).toBe(1);
    expect((await getPurchaseOrder(po.order.poNumber))!.lines[0].receivedQuantity).toBe('5 mg');
  });
  it('rejects a correction when the disposition changes during review', async () => {
    await createLot(intake('LOCAL-A'), staff);
    const lot = (await getLot('LOCAL-A'))!;
    const v = validateLotCorrection(lotToIntakeInput(lot), { storageLocation: 'Freezer A' }, 'Location corrected');
    if (!v.ok) throw new Error(JSON.stringify(v));
    local.beforeNextBatch(() => local.sqlite.exec("UPDATE lots SET status = 'on_hold'"));
    expect((await correctLot(lot, v, staff)).ok).toBe(false); expect(count('lots')).toBe(1);
  });
  it('rejects tomorrow as a received date', () => {
    expect(validateLotIntake({ lotNumber: 'LOCAL-A', productCode: 'NPL-001', quantityReceived: '5 mg', receivedAt: '2026-09-05' }).ok).toBe(false);
  });
});
