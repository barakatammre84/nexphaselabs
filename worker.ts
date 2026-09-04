import handler from 'vinext/server/fetch-handler';
import { dispatchNotifications } from './lib/notifications';

/** Keep the framework's fetch handler; native cron drains the durable queue. */
export default {
  fetch: handler.fetch,
  async scheduled() {
    console.info('[notifications] dispatch complete', await dispatchNotifications());
  },
};
