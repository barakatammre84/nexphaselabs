import { ACTIVITY_DOMAINS, activityTimeline, queueCounts } from '@/lib/activity';
import { sendEmail } from '@/lib/email';
import { lotAlerts } from '@/lib/lot-alerts';
import { publicOrigin } from '@/lib/site-config';

/**
 * A plain-text operations digest: what is waiting, what needs a person, and
 * what happened since yesterday. Sent on demand from the dashboard or by an
 * external scheduler holding DIGEST_TOKEN. Admin-level content: it spans
 * customer accounts and staff credential state, so it goes only to an admin
 * (the dashboard button sends to the admin pressing it; DIGEST_TO must be an
 * admin's address). Never sent to a customer.
 */
export async function composeDigest(now = new Date()): Promise<{ subject: string; text: string }> {
  const since = new Date(now.getTime() - 24 * 3600 * 1000);
  const [counts, alerts, activity] = await Promise.all([queueCounts(), lotAlerts(now), activityTimeline(ALL_DOMAINS, 1000, 200)]);
  const recent = activity.filter((a) => a.at >= since);
  const origin = publicOrigin();
  const line = (label: string, n: number, path: string) => (n > 0 ? `  ${String(n).padStart(3)}  ${label}  ${origin}${path}` : null);
  const queue = [
    line('organisations waiting for a verification decision', counts.verificationsWaiting, '/manage/verification'),
    line('orders awaiting payment', counts.ordersAwaitingPayment, '/manage/orders'),
    line('paid orders to pick and ship', counts.ordersToFulfil, '/manage/orders'),
    line('orders being prepared', counts.ordersFulfilling, '/manage/orders'),
    line('refunds due', counts.refundsDue, '/manage/orders'),
    line('lots in quarantine', counts.lotsInQuarantine, '/manage/lots'),
    line('lots on hold', counts.lotsOnHold, '/manage/lots'),
    line('open purchase orders', counts.openPurchaseOrders, '/manage/procurement'),
    line('staff still on a one-time password', counts.staffOnOneTimePassword, '/manage/staff'),
  ].filter(Boolean);
  const text = [
    `NexPhase Labs operations digest — ${now.toISOString().slice(0, 10)}`,
    '',
    'WAITING FOR A PERSON',
    ...(queue.length ? queue : ['  Nothing in the queues.']),
    '',
    `LOT ALERTS (${alerts.length})`,
    ...(alerts.length ? alerts.slice(0, 20).map((a) => `  ${a.severity === 'urgent' ? '!!' : ' -'} ${a.lotNumber} ${a.productName}: ${a.message}`) : ['  None.']),
    ...(alerts.length > 20 ? [`  … and ${alerts.length - 20} more at ${origin}/manage/lots`] : []),
    '',
    `LAST 24 HOURS (${recent.length} events)`,
    ...(recent.length ? recent.slice(0, 60).map((a) => `  ${a.at.toISOString().slice(11, 16)}  ${a.domain.padEnd(12)} ${a.subject} — ${a.action} — ${a.actor}${a.note ? ` — ${a.note.slice(0, 120)}` : ''}`) : ['  Nothing recorded.']),
    ...(recent.length > 60 ? [`  … and ${recent.length - 60} more at ${origin}/manage/activity`] : []),
    '',
    `Dashboard: ${origin}/manage`,
  ].join('\n');
  return { subject: `NexPhase operations digest — ${now.toISOString().slice(0, 10)}`, text };
}

/** Everything except staff sign-in noise; kept in step with the timeline's domain list. */
const ALL_DOMAINS = ACTIVITY_DOMAINS.filter((d) => d !== 'staff');

export async function sendDigest(to: string, now = new Date()): Promise<{ ok: boolean; error?: string }> {
  const { subject, text } = await composeDigest(now);
  const result = await sendEmail({ to, subject, text });
  return result.ok ? { ok: true } : { ok: false, error: result.error };
}
