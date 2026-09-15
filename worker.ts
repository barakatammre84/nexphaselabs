import handler from 'vinext/server/fetch-handler';
import { dispatchNotifications } from './lib/notifications';
import { cleanupExpiredCommerceRecords } from './lib/commerce-maintenance';
import { feedbackRealtime } from './lib/feedback-realtime';
import { gateNonProduction, withNoindex } from './lib/environment-gate';
import { legacyDecision, legacyResponse } from './lib/legacy-redirects';
import { syncZelleMailbox } from './lib/zelle-gmail';
import { pollUspsTracking } from '@/lib/usps-tracking';
import { zelleInboxEnabled } from './lib/zelle-config';

export { FeedbackRoom } from './lib/feedback-room';

/** Keep the framework's fetch handler; native cron drains the durable queue. */
export default {
  async fetch(
    request: Request,
    runtimeEnv: Cloudflare.Env,
    ctx: ExecutionContext,
  ) {
    const gate = gateNonProduction(
      request,
      runtimeEnv.APP_ENV,
      runtimeEnv.STAGING_ACCESS_PASSWORD,
      runtimeEnv.STAGING_ACCESS_OPEN,
    );
    if (gate) return gate;
    const { pathname } = new URL(request.url);
    // Static assets normally never reach the worker at all — Workers Assets serves
    // them ahead of it, which means the password gate above would not have covered
    // the bundles. Staging sets assets.run_worker_first so every request passes the
    // gate first; the framework handler does not serve assets, so they are handed
    // back to the asset store here, immutable caching intact. Production does not
    // set it, and this branch never runs there.
    if (pathname.startsWith('/_next/static/')) {
      return runtimeEnv.ASSETS.fetch(request);
    }
    // What the WordPress URLs do after the cutover: 301 where an equivalent
    // exists, 410 where the page is genuinely gone. Product pages are decided
    // against the catalog in app/product/[slug]/route.ts, not here.
    const legacy = legacyDecision(pathname);
    if (legacy) return legacyResponse(legacy, request.url);
    // Every WordPress URL carries a trailing slash, and the framework answers
    // /product/<slug>/ with its own 308 to the slashless form. Strip it here so
    // an indexed product URL takes one hop to its new page instead of two.
    let forwarded = request;
    if (pathname.startsWith('/product/') && pathname.endsWith('/')) {
      const url = new URL(request.url);
      url.pathname = pathname.replace(/\/+$/, '');
      forwarded = new Request(url, request);
    }
    if (pathname === '/api/feedback/realtime') {
      return feedbackRealtime(request, runtimeEnv);
    }
    const response = await handler.fetch(forwarded, runtimeEnv, ctx);
    // Anything else under the asset directory — favicon, product images, the client
    // manifest — reaches the handler as a 404. Serve it only when the asset store
    // really has it, so the application's own not-found page still wins.
    if (response.status === 404 && (request.method === 'GET' || request.method === 'HEAD')) {
      const asset = await runtimeEnv.ASSETS.fetch(request);
      if (asset.ok) return asset;
    }
    return withNoindex(response, runtimeEnv.APP_ENV);
  },
  async scheduled() {
    // USPS has no tracking webhook in use here, so the parcel status that marks
    // an order delivered is polled on this tick. It no-ops unless USPS is the
    // configured provider, and an unchanged status writes nothing.
    const [notifications, maintenance, zelle, tracking] = await Promise.all([
      dispatchNotifications(),
      cleanupExpiredCommerceRecords(),
      zelleInboxEnabled()
        ? syncZelleMailbox()
        : Promise.resolve({ ok: true, skipped: true }),
      pollUspsTracking().catch((error: unknown) => ({
        skipped: `tracking poll failed: ${error instanceof Error ? error.message : 'unknown'}`,
      })),
    ]);
    console.info('[scheduled] dispatch, maintenance, payment sync and tracking complete', {
      notifications,
      maintenance,
      zelle,
      tracking,
    });
  },
};
