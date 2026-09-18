import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { localD1 } from './helpers/local-d1';
const { env, auth } = vi.hoisted(() => ({ env: {} as { DB?: D1Database }, auth: { role: 'admin' as string | null } }));
vi.mock('cloudflare:workers', () => ({ env }));
vi.mock('@/lib/staff-auth', () => ({
  getStaffFromRequest: async () => auth.role ? { id: 'staff_admin', name: 'Admin', email: 'admin@example.invalid', sessionId: 'session', mustChangePassword: false, role: auth.role } : null,
  hasStaffPermission: (staff: { role: string }, permission: string) =>
    staff.role === 'admin' && permission === 'reports.sensitive',
}));
import { getDb } from '@/db';
import { accounts, lots, orderItems, orders, sensitiveReportExportAlerts, sensitiveReportExports, staffEvents, staffUsers } from '@/db/schema';
import { cleanupSensitiveExportMonitoring, recordSensitiveExport } from '@/lib/report-exports';
import { orderLines, reportPeriod, revenueByProduct } from '@/lib/reports';
import { GET } from '@/app/api/manage/reports/orders.csv/route';
let local: ReturnType<typeof localD1>;
beforeEach(async () => {
  local = localD1(); env.DB = local.binding; auth.role = 'admin';
  await getDb().insert(staffUsers).values({ id: 'staff_admin', email: 'admin@example.invalid', name: 'Admin', passwordHash: 'disabled', role: 'admin' });
  await getDb().insert(accounts).values({ id: 'customer', email: 'synthetic@example.invalid', name: 'Synthetic', passwordHash: 'disabled' });
  await getDb().insert(orders).values({ id: 'order1', orderNumber: 'NX-260904-0001', accountId: 'customer', status: 'shipped', paymentStatus: 'refund_due', subtotalCents: 300, shippingCents: 50, totalCents: 350, priceTier: 'institutional', consigneeName: 'Synthetic', shipToLine1: 'Test', shipToCity: 'Test', shipToRegion: 'CA', shipToPostalCode: '00000', shipToCountry: 'US', submittedAt: new Date(), deliveredAt: new Date('2026-09-09T00:00:00Z'), refundCents: 50, refundDueCents: 100, returnedAt: new Date() });
  await getDb().insert(lots).values({ id: 'lot1', lotNumber: 'LOCAL-LOT', productCode: 'NPL-001', productName: 'Synthetic', casNumber: '50-00-0', status: 'released', analyticalLab: 'Fixture lab', accessionNumber: 'ACC-FIXTURE', testingStandard: 'Fixture panel v1', receivedAt: new Date(), quantityReceived: '10 mg', quantityRemaining: '6 mg', costCents: 100 });
    for (let i = 0; i < 4; i++) {
});
afterEach(() => { local.sqlite.close(); delete env.DB; });
describe('report reconciliation', () => {
  it('uses inclusive calendar dates and defaults to the current UTC month', () => {
    const explicit = reportPeriod('2026-09-01', '2026-09-30');
    expect(explicit.from.toISOString()).toBe('2026-09-01T00:00:00.000Z');
    expect(explicit.toExclusive.toISOString()).toBe('2026-10-01T00:00:00.000Z');
    const fallback = reportPeriod('bad', 'bad', new Date('2026-09-08T12:00:00Z'));
    expect([fallback.fromText, fallback.toText]).toEqual(['2026-09-01', '2026-09-30']);
  });
  it('filters order-based reports by submitted date', async () => {
    expect(await orderLines(reportPeriod('2000-01-01', '2000-01-31'))).toEqual([]);
    expect(await revenueByProduct(reportPeriod('2000-01-01', '2000-01-31'))).toEqual([]);
  });
  it('allocates refunds to returned lines and conserves lot costs', async () => {
    const lines = await orderLines();
    expect(lines.map((l) => l.refundShareCents)).toEqual([50, 0]);
    expect(lines.map((l) => l.costCents)).toEqual([20, 20]);
    expect(lines.every((l) => l.refundOutstandingCents === 50)).toBe(true);
    expect(await revenueByProduct()).toMatchObject([{ revenueCents: 300, refundedCents: 50, costCents: 40 }]);
  });
  it('exports order totals and obligations once, with net and gross margins distinguished', async () => {
    const response = await GET(new Request('https://example.invalid/api/manage/reports/orders.csv?from=2026-09-01&to=2026-09-30&purpose=financial_reconciliation'));
    expect(response.status).toBe(200);
    const rows = (await response.text()).trim().split(/\r?\n/).map((r) =>
      [...r.matchAll(/(?:^|,)(?:"((?:""|[^"])*)"|([^,]*))/g)].map((m) => (m[1] ?? m[2]).replace(/""/g, '"')));
    const index = (header: string) => rows[0].indexOf(header);
    for (const [header, expected] of [['Order total', '3.50'], ['Order shipping', '0.50'], ['Order refund outstanding', '0.50'], ['Order refund', '0.50']]) {
      expect(rows[1][index(header)]).toBe(expected); expect(rows[2][index(header)]).toBe('');
    }
    expect(index('Customer')).toBe(-1);
    expect(index('Email')).toBe(-1);
    expect(index('Ship to')).toBe(-1);
    expect(rows[1][index('Delivered on')]).toBe('2026-09-09');
    expect(rows[1].at(-1)).toBe('0.30'); expect(rows[2].at(-1)).toBe('1.80');
  });
  it('requires and records an attributed purpose and filters', async () => {
    expect((await GET(new Request('https://example.invalid/api/manage/reports/orders.csv'))).status).toBe(400);
    const response = await GET(new Request('https://example.invalid/api/manage/reports/orders.csv?from=2026-09-01&to=2026-09-30&purpose=financial_reconciliation'));
    expect(response.status).toBe(200);
    const [event] = await getDb().select().from(staffEvents);
    expect(event).toMatchObject({ userId: 'staff_admin', action: 'sensitive_report_export', actor: 'Admin (staff_admin)' });
    expect(JSON.parse(event.detail ?? '{}')).toEqual({
      purpose: 'financial_reconciliation',
      reportType: 'orders',
      filters: { from: '2026-09-01', to: '2026-09-30' },
      rowCount: 2,
    });
    expect(await getDb().select().from(sensitiveReportExports)).toHaveLength(1);
  });
  it('rejects free-text purposes outside the approved list', async () => {
    expect((await GET(new Request('https://example.invalid/api/manage/reports/orders.csv?purpose=Just+checking'))).status).toBe(400);
  });
  it('alerts on the fifth hourly export and on exports of at least 1000 rows', async () => {
    const staff = { id: 'staff_admin', name: 'Admin', email: 'admin@example.invalid', sessionId: 'session', mustChangePassword: false, role: 'admin' as const };
    const now = new Date('2026-09-18T12:00:00Z');
    for (let i = 0; i < 4; i++) {
      expect((await recordSensitiveExport({ staff, purpose: 'financial_reconciliation', reportType: 'orders', filters: {}, rowCount: 10, now: new Date(now.getTime() + i * 1000) })).alerted).toBe(false);
    }
    expect((await recordSensitiveExport({ staff, purpose: 'financial_reconciliation', reportType: 'orders', filters: {}, rowCount: 10, now: new Date(now.getTime() + 4000) })).alerted).toBe(true);
    expect((await recordSensitiveExport({ staff, purpose: 'incident_investigation', reportType: 'shipments', filters: {}, rowCount: 1000, now: new Date(now.getTime() + 2 * 60 * 60 * 1000) })).alerted).toBe(true);
    const alerts = await getDb().select().from(sensitiveReportExportAlerts);
    expect(alerts.map((alert) => alert.reason)).toEqual([
      '5 exports by this administrator within one hour',
      '1000 rows in one export',
    ]);
  });
  it('cleans expired audit metadata and resolved alerts without deleting open alerts', async () => {
    const now = new Date('2026-09-18T12:00:00Z');
    const old = new Date('2025-08-01T00:00:00Z');
    local.sqlite.exec(`
      INSERT INTO sensitive_report_exports VALUES ('old-open', 'staff_admin', 'incident_investigation', 'orders', '{}', 1, ${Math.floor(old.getTime() / 1000)});
      INSERT INTO sensitive_report_exports VALUES ('old-resolved', 'staff_admin', 'incident_investigation', 'orders', '{}', 1, ${Math.floor(old.getTime() / 1000)});
      INSERT INTO sensitive_report_export_alerts VALUES ('alert-open', 'old-open', 'staff_admin', 'reason', ${Math.floor(old.getTime() / 1000)}, NULL);
      INSERT INTO sensitive_report_export_alerts VALUES ('alert-resolved', 'old-resolved', 'staff_admin', 'reason', ${Math.floor(old.getTime() / 1000)}, ${Math.floor(new Date('2026-01-01').getTime() / 1000)});
    `);
    await cleanupSensitiveExportMonitoring(now);
    expect(local.sqlite.prepare('SELECT id FROM sensitive_report_export_alerts').all()).toEqual([
      { id: 'alert-open' },
    ]);
    expect(local.sqlite.prepare('SELECT id FROM sensitive_report_exports').all()).toEqual([
      { id: 'old-open' },
    ]);
  });
  it('excludes cancelled orders from sales while retaining their refund obligation in the order report', async () => {
    local.sqlite.exec("UPDATE orders SET status = 'cancelled'");
    expect(await revenueByProduct()).toEqual([]);
    expect((await orderLines())[0].refundOutstandingCents).toBe(50);
  });
  it.each([null, 'qc', 'ops'])('refuses exports to non-admin callers: %s', async (role) => {
    auth.role = role;
    expect((await GET(new Request('https://example.invalid/api/manage/reports/orders.csv?purpose=financial_reconciliation'))).status).toBe(role ? 403 : 401);
  });
});
