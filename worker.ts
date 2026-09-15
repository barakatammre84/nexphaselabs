import handler from 'vinext/server/fetch-handler';
import { dispatchNotifications } from './lib/notifications';
import { cleanupExpiredCommerceRecords } from './lib/commerce-maintenance';
import { feedbackRealtime } from './lib/feedback-realtime';
import { gateNonProduction, withNoindex } from './lib/environment-gate';
import { legacyDecision, legacyResponse } from './lib/legacy-redirects';
import { syncZelleMailbox } from './lib/zelle-gmail';
import { zelleInboxEnabled } from './lib/zelle-config';
import { shieldLargeUpload } from './lib/large-uploads';
import { runScheduledJobs } from './lib/scheduled-jobs';
import { withSecurityHeaders } from './lib/security-headers';

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
    // Redirects, 410s and fallback assets are finished like pages: noindex where it applies
    // (lib/environment-gate.ts) and the browser security headers (lib/security-headers.ts).
    // Only the /_next/static bundles and the feedback socket leave untouched.
    const finish = (answer: Response) =>
      withSecurityHeaders(
        withNoindex(answer, runtimeEnv.APP_ENV, request.url, runtimeEnv.PUBLIC_ORIGIN),
        request.url,
      );
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
    if (legacy) return finish(legacyResponse(legacy, request.url));
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
      // Never through finish(): the room's 101 carries the WebSocket itself, and
      // copying the response to add a header would lose the socket.
      return feedbackRealtime(request, runtimeEnv);
    }
    // Document and image uploads can be larger than the framework's server-action
    // body limit, which vinext also applies to route handlers. Relabelled here, they
    // reach their routes unread (lib/large-uploads.ts).
    forwarded = shieldLargeUpload(forwarded, pathname);
    const response = await handler.fetch(forwarded, runtimeEnv, ctx);
    // Anything else under the asset directory — favicon, product images, the client
    // manifest — reaches the handler as a 404. Serve it only when the asset store
    // really has it, so the application's own not-found page still wins.
    if (response.status === 404 && (request.method === 'GET' || request.method === 'HEAD')) {
      const asset = await runtimeEnv.ASSETS.fetch(request);
      if (asset.ok) return finish(asset);
    }
    return finish(response);
  },
  async scheduled() {
    // Each job settles on its own; one failure no longer stops the others (lib/scheduled-jobs.ts).
    await runScheduledJobs({
      notifications: () => dispatchNotifications(),
      maintenance: () => cleanupExpiredCommerceRecords(),
      zelle: () =>
        zelleInboxEnabled()
          ? syncZelleMailbox()
          : Promise.resolve({ ok: true, skipped: true }),
    });
  },
};
