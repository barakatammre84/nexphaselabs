import { getDb } from '@/db';
import {
  sensitiveReportExportAlerts,
  sensitiveReportExports,
  staffEvents,
  staffUsers,
} from '@/db/schema';
import { hasStaffPermission, type StaffPrincipal } from '@/lib/staff-auth';
import { and, asc, count, eq, gt, isNull, lt, notInArray } from 'drizzle-orm';

export const EXPORT_PURPOSES = {
  financial_reconciliation: 'Financial reconciliation',
  inventory_custody_review: 'Inventory and custody review',
  tax_reporting: 'Tax reporting',
  legal_compliance: 'Legal or regulatory compliance',
  incident_investigation: 'Incident investigation',
} as const;
export type ExportPurpose = keyof typeof EXPORT_PURPOSES;
export const EXPORT_FREQUENCY_WINDOW_MS = 60 * 60 * 1000;
export const EXPORT_FREQUENCY_THRESHOLD = 5;
export const EXPORT_ROW_THRESHOLD = 1_000;
export const EXPORT_AUDIT_RETENTION_DAYS = 400;
export const RESOLVED_EXPORT_ALERT_RETENTION_DAYS = 90;

export function canDownloadSensitiveReports(staff: Pick<StaffPrincipal, 'role'>): boolean {
  return hasStaffPermission(staff, 'reports.sensitive');
}

export function exportPurpose(searchParams: URLSearchParams): ExportPurpose | null {
  const purpose = searchParams.get('purpose')?.trim() ?? '';
  return purpose in EXPORT_PURPOSES ? (purpose as ExportPurpose) : null;
}

export async function recordSensitiveExport(input: {
  staff: StaffPrincipal;
  purpose: ExportPurpose;
  reportType: string;
  filters: Record<string, string>;
  rowCount: number;
  userAgent?: string | null;
  now?: Date;
}): Promise<{ alerted: boolean }> {
  if (!Number.isSafeInteger(input.rowCount) || input.rowCount < 0) {
    throw new Error('Sensitive export row count must be a non-negative integer.');
  }
  const db = getDb();
  const now = input.now ?? new Date();
  const exportId = `exp_${crypto.randomUUID().replaceAll('-', '')}`;
  const [{ value: recentCount }] = await db
    .select({ value: count() })
    .from(sensitiveReportExports)
    .where(
      and(
        eq(sensitiveReportExports.staffUserId, input.staff.id),
        gt(sensitiveReportExports.createdAt, new Date(now.getTime() - EXPORT_FREQUENCY_WINDOW_MS)),
      ),
    );
  const reasons = [
    ...(Number(recentCount) + 1 >= EXPORT_FREQUENCY_THRESHOLD
      ? [`${Number(recentCount) + 1} exports by this administrator within one hour`]
      : []),
    ...(input.rowCount >= EXPORT_ROW_THRESHOLD
      ? [`${input.rowCount} rows in one export`]
      : []),
  ];
  const values = {
    id: exportId,
    staffUserId: input.staff.id,
    purpose: input.purpose,
    reportType: input.reportType,
    filters: input.filters,
    rowCount: input.rowCount,
    createdAt: now,
  };
  const staffEvent = {
    id: `evt_${crypto.randomUUID().replaceAll('-', '')}`,
    userId: input.staff.id,
    action: 'sensitive_report_export',
    detail: JSON.stringify({
      purpose: input.purpose,
      reportType: input.reportType,
      filters: input.filters,
      rowCount: input.rowCount,
    }),
    actor: `${input.staff.name} (${input.staff.id})`,
    userAgent: input.userAgent?.slice(0, 500) || null,
    createdAt: now,
  };
  await db.batch([
    db.insert(sensitiveReportExports).values(values),
    db.insert(staffEvents).values(staffEvent),
    ...(reasons.length
      ? [
          db.insert(sensitiveReportExportAlerts).values({
            id: `exa_${crypto.randomUUID().replaceAll('-', '')}`,
            exportId,
            staffUserId: input.staff.id,
            reason: reasons.join('; '),
            createdAt: now,
          }),
        ]
      : []),
  ]);
  return { alerted: reasons.length > 0 };
}

export async function cleanupSensitiveExportMonitoring(now = new Date()): Promise<void> {
  const db = getDb();
  const auditCutoff = new Date(now.getTime() - EXPORT_AUDIT_RETENTION_DAYS * 86_400_000);
  const resolvedAlertCutoff = new Date(
    now.getTime() - RESOLVED_EXPORT_ALERT_RETENTION_DAYS * 86_400_000,
  );
  await db
    .delete(sensitiveReportExportAlerts)
    .where(lt(sensitiveReportExportAlerts.resolvedAt, resolvedAlertCutoff));
  const openAlerts = await db
    .select({ exportId: sensitiveReportExportAlerts.exportId })
    .from(sensitiveReportExportAlerts)
    .where(isNull(sensitiveReportExportAlerts.resolvedAt));
  await db
    .delete(sensitiveReportExports)
    .where(
      openAlerts.length
        ? and(
            lt(sensitiveReportExports.createdAt, auditCutoff),
            notInArray(
              sensitiveReportExports.id,
              openAlerts.map((alert) => alert.exportId),
            ),
          )
        : lt(sensitiveReportExports.createdAt, auditCutoff),
    );
}

export async function openSensitiveExportAlerts() {
  return getDb()
    .select({
      id: sensitiveReportExportAlerts.id,
      staffName: staffUsers.name,
      reason: sensitiveReportExportAlerts.reason,
      createdAt: sensitiveReportExportAlerts.createdAt,
    })
    .from(sensitiveReportExportAlerts)
    .innerJoin(staffUsers, eq(sensitiveReportExportAlerts.staffUserId, staffUsers.id))
    .where(isNull(sensitiveReportExportAlerts.resolvedAt))
    .orderBy(asc(sensitiveReportExportAlerts.createdAt));
}