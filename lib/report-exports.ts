import { getDb } from '@/db';
import { staffEvents } from '@/db/schema';
import { hasStaffPermission, type StaffPrincipal } from '@/lib/staff-auth';

export const EXPORT_PURPOSE_MIN_LENGTH = 12;
export const EXPORT_PURPOSE_MAX_LENGTH = 200;

export function canDownloadSensitiveReports(staff: Pick<StaffPrincipal, 'role'>): boolean {
  return hasStaffPermission(staff, 'reports.sensitive');
}

export function exportPurpose(searchParams: URLSearchParams): string | null {
  const purpose = searchParams.get('purpose')?.trim() ?? '';
  return purpose.length >= EXPORT_PURPOSE_MIN_LENGTH && purpose.length <= EXPORT_PURPOSE_MAX_LENGTH
    ? purpose
    : null;
}

export async function recordSensitiveExport(input: {
  staff: StaffPrincipal;
  purpose: string;
  reportType: string;
  filters: Record<string, string>;
  userAgent?: string | null;
}): Promise<void> {
  await getDb().insert(staffEvents).values({
    id: `evt_${crypto.randomUUID().replaceAll('-', '')}`,
    userId: input.staff.id,
    action: 'sensitive_report_export',
    detail: JSON.stringify({
      purpose: input.purpose,
      reportType: input.reportType,
      filters: input.filters,
    }),
    actor: `${input.staff.name} (${input.staff.id})`,
    userAgent: input.userAgent?.slice(0, 500) || null,
    createdAt: new Date(),
  });
}