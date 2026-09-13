import handler from 'vinext/server/fetch-handler';
import { dispatchNotifications } from './lib/notifications';
import { cleanupExpiredCommerceRecords } from './lib/commerce-maintenance';
import { feedbackRealtime } from './lib/feedback-realtime';
import { gateNonProduction, withNoindex } from './lib/environment-gate';

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
    if (pathname === '/api/feedback/realtime') {
      return feedbackRealtime(request, runtimeEnv);
    }
    const response = await handler.fetch(request, runtimeEnv, ctx);
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
    const [notifications, maintenance] = await Promise.all([
      dispatchNotifications(),
      cleanupExpiredCommerceRecords(),
    ]);
    console.info('[scheduled] dispatch and maintenance complete', {
      notifications,
      maintenance,
    });
  },
};
