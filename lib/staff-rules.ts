import { STAFF_ROLES, type StaffRole } from '@/lib/staff-roles';

export type StaffInput = { email: string; name: string; role: string };
export type StaffValidation = { ok: true; value: { email: string; name: string; role: StaffRole } } | { ok: false; errors: string[] };

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function validateStaffInput(raw: StaffInput): StaffValidation {
  const errors: string[] = [];
  const email = (raw.email ?? '').trim().toLowerCase();
  const name = (raw.name ?? '').trim().replace(/\s+/g, ' ');
  const role = (raw.role ?? '').trim();
  if (!EMAIL.test(email) || email.length > 200) errors.push('Enter a valid email address.');
  if (name.length < 2 || name.length > 80) errors.push('Name must be 2–80 characters.');
  if (!(STAFF_ROLES as readonly string[]).includes(role)) errors.push(`Role must be one of: ${STAFF_ROLES.join(', ')}.`);
  if (errors.length) return { ok: false, errors };
  return { ok: true, value: { email, name, role: role as StaffRole } };
}

/** One-time passwords: 20 characters from an alphabet without look-alikes. Shown once, never stored. */
export function oneTimePassword(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  const limit = 256 - (256 % alphabet.length); // rejection sampling: no modulo bias
  const out: string[] = [];
  while (out.length < 20) {
    for (const b of crypto.getRandomValues(new Uint8Array(32))) {
      if (b < limit && out.length < 20) out.push(alphabet[b % alphabet.length]);
    }
  }
  return out.join('');
}
