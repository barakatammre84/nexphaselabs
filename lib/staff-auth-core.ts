/**
 * Password and token primitives for staff auth. WebCrypto only, no framework
 * imports, so the same code runs in Workers, in vitest, and in the
 * scripts/staff-create.ts bootstrap under Node.
 */

export const PBKDF2_ITERATIONS = 100_000;

const enc = new TextEncoder();

function toBase64(bytes: Uint8Array): string {
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}

function fromBase64(value: string): Uint8Array {
  const binary = atob(value);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

export function toHex(bytes: Uint8Array): string {
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function pbkdf2(password: string, salt: Uint8Array, iterations: number): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt: salt as BufferSource, iterations },
    key,
    256,
  );
  return new Uint8Array(bits);
}

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await pbkdf2(password, salt, PBKDF2_ITERATIONS);
  return `pbkdf2$${PBKDF2_ITERATIONS}$${toBase64(salt)}$${toBase64(hash)}`;
}

function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [scheme, iterations, saltB64, hashB64] = stored.split('$');
  if (scheme !== 'pbkdf2' || !iterations || !saltB64 || !hashB64) return false;
  const iter = Number(iterations);
  if (!Number.isInteger(iter) || iter < 10_000 || iter > 1_000_000) return false;
  let expected: Uint8Array;
  let salt: Uint8Array;
  try {
    expected = fromBase64(hashB64);
    salt = fromBase64(saltB64);
  } catch {
    return false;
  }
  const actual = await pbkdf2(password, salt, iter);
  return timingSafeEqual(actual, expected);
}

export async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', enc.encode(value));
  return toHex(new Uint8Array(digest));
}

export function randomToken(): string {
  return toHex(crypto.getRandomValues(new Uint8Array(32)));
}

/** Password policy for staff: length is what matters. */
export function passwordPolicyError(password: string): string | null {
  if (password.length < 12) return 'Password must be at least 12 characters.';
  if (password.length > 200) return 'Password is too long.';
  return null;
}
