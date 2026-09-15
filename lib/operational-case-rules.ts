export const CASE_TYPES = [
  'complaint',
  'deviation',
  'supplier_issue',
  'incident',
  'capa',
  'recall',
] as const;
export type CaseType = (typeof CASE_TYPES)[number];

export const CASE_TYPE_LABEL: Record<CaseType, string> = {
  complaint: 'Complaint',
  deviation: 'Deviation',
  supplier_issue: 'Supplier issue',
  incident: 'Incident',
  capa: 'Corrective / preventive action',
  recall: 'Recall',
};

export const CASE_SEVERITIES = ['low', 'medium', 'high', 'critical'] as const;
export type CaseSeverity = (typeof CASE_SEVERITIES)[number];

export const CASE_STATUSES = [
  'open',
  'contained',
  'investigating',
  'action_required',
  'effectiveness_review',
  'closed',
] as const;
export type CaseStatus = (typeof CASE_STATUSES)[number];

export const CASE_STATUS_LABEL: Record<CaseStatus, string> = {
  open: 'Open',
  contained: 'Contained',
  investigating: 'Investigating',
  action_required: 'Action required',
  effectiveness_review: 'Effectiveness review',
  closed: 'Closed',
};

/**
 * The statuses the case form offers. Only an administrator may close a case
 * (updateOperationalCase refuses anyone else), so Closed is offered to others
 * only on a case that is already closed, where the form still has to show it.
 */
export function caseStatusOptions(role: string, currentStatus?: string): CaseStatus[] {
  return CASE_STATUSES.filter(
    (status) => status !== 'closed' || role === 'admin' || currentStatus === 'closed',
  );
}
