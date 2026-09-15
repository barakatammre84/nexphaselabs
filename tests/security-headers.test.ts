import { describe, expect, it } from 'vitest';
import { withSecurityHeaders } from '@/lib/security-headers';

describe('browser security headers', () => {
  it('sets the framing, sniffing, referrer and feature protections on a page', async () => {
    const response = withSecurityHeaders(
      new Response('<html></html>', { headers: { 'Content-Type': 'text/html' } }),
      'https://nexphaselabs.net/manage/orders/NX-260915-0001',
    );
    expect(response.headers.get('X-Frame-Options')).toBe('DENY');
    expect(response.headers.get('Content-Security-Policy')).toBe("frame-ancestors 'none'");
    expect(response.headers.get('X-Content-Type-Options')).toBe('nosniff');
    expect(response.headers.get('Referrer-Policy')).toBe('strict-origin-when-cross-origin');
    expect(response.headers.get('Permissions-Policy')).toContain('camera=()');
    expect(response.headers.get('Strict-Transport-Security')).toBe('max-age=31536000');
    expect(await response.text()).toBe('<html></html>');
  });

  it('pins HTTPS only on an HTTPS origin, never on local development', () => {
    const local = withSecurityHeaders(new Response('ok'), 'http://localhost:3000/');
    expect(local.headers.get('Strict-Transport-Security')).toBeNull();
    expect(local.headers.get('X-Frame-Options')).toBe('DENY');
  });

  it('keeps a header a route set for itself', () => {
    const own = withSecurityHeaders(
      new Response('ok', { headers: { 'Content-Security-Policy': "default-src 'none'", 'X-Frame-Options': 'SAMEORIGIN' } }),
      'https://nexphaselabs.net/api/documents/x',
    );
    expect(own.headers.get('Content-Security-Policy')).toBe("default-src 'none'");
    expect(own.headers.get('X-Frame-Options')).toBe('SAMEORIGIN');
  });

  it('works on a redirect, whose headers the platform makes immutable', () => {
    const redirect = withSecurityHeaders(Response.redirect('https://nexphaselabs.net/catalog', 301), 'https://nexphaselabs.net/shop/');
    expect(redirect.status).toBe(301);
    expect(redirect.headers.get('Location')).toBe('https://nexphaselabs.net/catalog');
    expect(redirect.headers.get('X-Frame-Options')).toBe('DENY');
  });

  it('passes a WebSocket upgrade through untouched', () => {
    const upgrade = { status: 101 } as Response;
    expect(withSecurityHeaders(upgrade, 'https://nexphaselabs.net/api/feedback/realtime')).toBe(upgrade);
  });

  it('treats an unreadable request URL as not HTTPS rather than failing', () => {
    expect(withSecurityHeaders(new Response('ok'), 'not a url').headers.get('Strict-Transport-Security')).toBeNull();
  });
});
