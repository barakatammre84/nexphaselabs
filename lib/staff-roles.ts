/** Staff roles. Kept free of server-only imports so client components can list them. */
export type StaffRole = 'admin' | 'qc' | 'ops';
export const STAFF_ROLES: StaffRole[] = ['admin', 'qc', 'ops'];
