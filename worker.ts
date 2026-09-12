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
    );
    if (gate) return gate;
    if (new URL(request.url).pathname === '/api/feedback/realtime') {
      return feedbackRealtime(request, runtimeEnv);
    }
    return withNoindex(await handler.fetch(request, runtimeEnv, ctx), runtimeEnv.APP_ENV);
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
