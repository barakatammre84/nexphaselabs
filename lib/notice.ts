/**
 * Refusal messages for customer pages.
 *
 * A refusal used to travel in the redirect URL and render verbatim, so anyone could send
 * a link that put their own sentence in an alert on a real product, cart or order page,
 * worded as payment instructions if they liked. The words now travel in a short-lived
 * cookie that only this site's routes set, and the URL carries only the code `notice`:
 * a link can point at a notice but cannot write one. Any other code shows at most the
 * page's own fixed words.
 */
export const NOTICE_COOKIE = 'nx_notice';
const MAX_LENGTH = 300;
const MAX_AGE_SECONDS = 120;

function encode(text: string): string {
  let binary = '';
  for (const byte of new TextEncoder().encode(text)) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/u, '');
}

function decode(value: string): string | null {
  if (!/^[A-Za-z0-9_-]+$/u.test(value)) return null;
  try {
    const binary = atob(value.replaceAll('-', '+').replaceAll('_', '/'));
    return new TextDecoder('utf-8', { fatal: true }).decode(
      Uint8Array.from(binary, (character) => character.charCodeAt(0)),
    );
  } catch {
    return null;
  }
}

const tidy = (text: string) => text.replace(/\s+/gu, ' ').trim().slice(0, MAX_LENGTH);

export function noticeCookie(message: string, secure: boolean): string {
  return `${NOTICE_COOKIE}=${encode(tidy(message))}; Path=/; Max-Age=${MAX_AGE_SECONDS}; HttpOnly; SameSite=Lax${secure ? '; Secure' : ''}`;
}

/** The words a route left for this browser, or null when there are none it wrote. */
export function readNotice(value: string | undefined): string | null {
  const text = value ? decode(value) : null;
  return text ? tidy(text) || null : null;
}

/**
 * A 303 to `path`, which should carry the page's `notice` code, leaving `message` for the
 * page to show. `cookies` are any other Set-Cookie values the response must carry.
 */
export function redirectWithNotice(
  request: Request,
  path: string,
  message: string,
  cookies: string[] = [],
): Response {
  const location = new URL(path, request.url);
  const headers = new Headers({ Location: location.href, 'Cache-Control': 'no-store' });
  for (const cookie of cookies) headers.append('Set-Cookie', cookie);
  const secure =
    location.protocol === 'https:' || (request.headers.get('x-forwarded-proto') ?? '').includes('https');
  headers.append('Set-Cookie', noticeCookie(message, secure));
  return new Response(null, { status: 303, headers });
}
