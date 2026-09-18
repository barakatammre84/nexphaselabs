import { beforeEach, describe, expect, it, vi } from 'vitest';

const { framework, realtime } = vi.hoisted(() => ({ framework: vi.fn(), realtime: vi.fn() }));
vi.mock('cloudflare:workers', () => ({ env: {}, DurableObject: class {} }));
vi.mock('vinext/server/fetch-handler', () => ({ default: { fetch: framework } }));
vi.mock('@/lib/feedback-realtime', () => ({ feedbackRealtime: realtime }));
// The cron jobs are not under test; keep their modules out of the import graph.
vi.mock('@/lib/notifications', () => ({ dispatchNotifications: vi.fn() }));
vi.mock('@/lib/commerce-maintenance', () => ({ cleanupExpiredCommerceRecords: vi.fn() }));
vi.mock('@/lib/report-exports', () => ({ cleanupSensitiveExportMonitoring: vi.fn() }));
vi.mock('@/lib/zelle-gmail', () => ({ syncZelleMailbox: vi.fn() }));
vi.mock('@/lib/feedback-room', () => ({ FeedbackRoom: class {} }));

import worker from '@/worker';

/**
 * worker.ts answers some requests before the framework does: old WordPress URLs
 * and assets the framework 404s. Those answers left staging without X-Robots-Tag,
 * so a redirect on the staging host could be indexed next to the real domain.
 * The feedback socket is the opposite case: its 101 must leave exactly as built.
 */

const STAGING = 'https://nexphaselabs-staging.nexphase.workers.dev';
const assets = vi.fn();
const staging = {
  APP_ENV: 'staging',
  STAGING_ACCESS_OPEN: 'true',
  PUBLIC_ORIGIN: STAGING,
  ASSETS: { fetch: assets },
} as unknown as Cloudflare.Env;
const production = {
  APP_ENV: 'production',
  PUBLIC_ORIGIN: 'https://nexphaselabs.net',
  ASSETS: { fetch: assets },
} as unknown as Cloudflare.Env;

const visit = (url: string, runtime = staging, init?: RequestInit) =>
  worker.fetch(new Request(url, init), runtime, {} as ExecutionContext);

beforeEach(() => {
  framework
    .mockReset()
    .mockResolvedValue(new Response('<html></html>', { headers: { 'Content-Type': 'text/html' } }));
  assets.mockReset().mockResolvedValue(new Response('not found', { status: 404 }));
  realtime.mockReset();
});

describe('noindex on answers the worker makes before the framework', () => {
  it('marks an old-URL redirect outside production', async () => {
    const answer = await visit(`${STAGING}/shop/`);
    expect(answer.status).toBe(301);
    expect(answer.headers.get('Location')).toBe(`${STAGING}/catalog`);
    expect(answer.headers.get('X-Robots-Tag')).toBe('noindex, nofollow');
    expect(framework).not.toHaveBeenCalled();
  });

  it('marks the 410 for a withdrawn page outside production', async () => {
    const answer = await visit(`${STAGING}/cart/`);
    expect(answer.status).toBe(410);
    expect(await answer.text()).toContain('Gone.');
    expect(answer.headers.get('X-Robots-Tag')).toBe('noindex, nofollow');
  });

  it('marks an asset served after the framework 404s', async () => {
    framework.mockResolvedValue(new Response('not found', { status: 404 }));
    assets.mockResolvedValue(
      new Response('icon', { status: 200, headers: { 'Content-Type': 'image/x-icon' } }),
    );
    const answer = await visit(`${STAGING}/favicon.ico`);
    expect(answer.status).toBe(200);
    expect(answer.headers.get('Content-Type')).toBe('image/x-icon');
    expect(await answer.text()).toBe('icon');
    expect(answer.headers.get('X-Robots-Tag')).toBe('noindex, nofollow');
  });

  it('still marks the framework page itself', async () => {
    const answer = await visit(`${STAGING}/catalog`);
    expect(answer.headers.get('X-Robots-Tag')).toBe('noindex, nofollow');
  });

  it('leaves the same answers indexable on the production domain', async () => {
    const redirect = await visit('https://nexphaselabs.net/shop/', production);
    expect(redirect.status).toBe(301);
    expect(redirect.headers.get('X-Robots-Tag')).toBeNull();
    framework.mockResolvedValue(new Response('not found', { status: 404 }));
    assets.mockResolvedValue(new Response('icon', { status: 200 }));
    const asset = await visit('https://nexphaselabs.net/favicon.ico', production);
    expect(asset.headers.get('X-Robots-Tag')).toBeNull();
  });

  it('returns the feedback socket upgrade exactly as the room built it', async () => {
    // Node cannot construct a 101 Response. The worker must hand the object back untouched,
    // because copying a real one to add a header would drop its WebSocket.
    const upgrade = { status: 101, webSocket: {}, headers: new Headers() } as unknown as Response;
    realtime.mockResolvedValue(upgrade);
    const answer = await visit(`${STAGING}/api/feedback/realtime?conversation=FB-260915-ABCDEF12`, staging, {
      headers: { Upgrade: 'websocket', Origin: STAGING },
    });
    expect(answer).toBe(upgrade);
    expect(framework).not.toHaveBeenCalled();
  });
});

describe('browser security headers on answers the worker finishes', () => {
  it('protects framework pages, old-URL redirects and fallback assets alike', async () => {
    const page = await visit('https://nexphaselabs.net/catalog', production);
    expect(page.headers.get('X-Frame-Options')).toBe('DENY');
    expect(page.headers.get('Strict-Transport-Security')).toBe('max-age=31536000');
    const redirect = await visit('https://nexphaselabs.net/shop/', production);
    expect(redirect.status).toBe(301);
    expect(redirect.headers.get('X-Content-Type-Options')).toBe('nosniff');
    framework.mockResolvedValue(new Response('not found', { status: 404 }));
    assets.mockResolvedValue(new Response('icon', { status: 200 }));
    const asset = await visit('https://nexphaselabs.net/favicon.ico', production);
    expect(asset.headers.get('Referrer-Policy')).toBe('strict-origin-when-cross-origin');
  });
});
