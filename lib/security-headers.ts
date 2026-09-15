/**
 * Browser security headers for the responses the worker builds.
 *
 * Deliberately limited to protections that cannot change what a page loads or runs:
 *
 *   - no framing by any site, so staff actions (mark paid, release a lot) cannot be
 *     clickjacked — the application embeds none of its own pages in frames;
 *   - no MIME sniffing;
 *   - no full URL sent to other sites as a referrer, so order numbers and emailed
 *     sign-in or verification tokens in a URL stay on this origin;
 *   - camera, microphone, geolocation and payment APIs switched off — nothing uses them;
 *   - HTTPS pinned for a year on any HTTPS origin (without includeSubDomains or preload,
 *     which are separate decisions for the domain).
 *
 * A full Content-Security-Policy for scripts and styles is not set here: it needs its
 * own testing against the framework's inline hydration before it can be enforced.
 * A header a route has already set is never overridden.
 */
const ALWAYS: [name: string, value: string][] = [
  ['X-Content-Type-Options', 'nosniff'],
  ['X-Frame-Options', 'DENY'],
  ['Content-Security-Policy', "frame-ancestors 'none'"],
  ['Referrer-Policy', 'strict-origin-when-cross-origin'],
  ['Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=(), usb=()'],
];

const HSTS = 'max-age=31536000';

export function withSecurityHeaders(response: Response, requestUrl: string): Response {
  // A WebSocket upgrade must reach the client exactly as it was built.
  if (response.status === 101) return response;
  const out = new Response(response.body, response);
  for (const [name, value] of ALWAYS) {
    if (!out.headers.has(name)) out.headers.set(name, value);
  }
  let secure = false;
  try {
    secure = new URL(requestUrl).protocol === 'https:';
  } catch {
    secure = false;
  }
  if (secure && !out.headers.has('Strict-Transport-Security')) {
    out.headers.set('Strict-Transport-Security', HSTS);
  }
  return out;
}
