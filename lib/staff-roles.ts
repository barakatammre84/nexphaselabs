/** Staff roles. Kept free of server-only imports so client components can list them. */
export type StaffRole = 'admin' | 'qc' | 'ops';
export const STAFF_ROLES: StaffRole[] = ['admin', 'qc', 'ops'];

export const STAFF_PERMISSION_KEYS = [
  'staff.manage',
  'accounts.approve',
  'finance.manage',
  'reports.sensitive',
  'catalog.manage',
  'quality.manage',
  'fulfillment.manage',
  'procurement.manage',
  'feedback.manage',
  'operations.manage',
] as const;
export type StaffPermission = (typeof STAFF_PERMISSION_KEYS)[number];

export const STAFF_PERMISSION_LABELS: Record<StaffPermission, string> = {
  'staff.manage': 'Staff accounts and access',
  'accounts.approve': 'Customer and organization approval',
  'finance.manage': 'Payments, refunds, costs and financial decisions',
  'reports.sensitive': 'Sensitive reports, readiness and notifications',
  'catalog.manage': 'Catalog, classes and product documents',
  'quality.manage': 'Test results, lot disposition and quality documents',
  'fulfillment.manage': 'Picking, shipping, delivery, returns and stock decreases',
  'procurement.manage': 'Supplier records and purchase orders',
  'feedback.manage': 'Customer feedback and support replies',
  'operations.manage': 'Operational controls and assigned cases',
};

export const STAFF_ROLE_TITLES: Record<StaffRole, string> = {
  admin: 'Business & systems lead',
  qc: 'Quality & supply lead',
  ops: 'Customer & fulfillment lead',
};

/** These templates are the authorization source used by server-side guards. */
export const STAFF_ROLE_PERMISSIONS: Record<
  StaffRole,
  readonly StaffPermission[]
> = {
  admin: STAFF_PERMISSION_KEYS,
  qc: ['catalog.manage', 'quality.manage', 'operations.manage'],
  ops: [
    'fulfillment.manage',
    'procurement.manage',
    'feedback.manage',
    'operations.manage',
  ],
};

export function roleHasPermission(
  role: StaffRole,
  permission: StaffPermission,
): boolean {
  return STAFF_ROLE_PERMISSIONS[role].includes(permission);
}
