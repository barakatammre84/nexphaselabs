# Runbook: customer order notifications

Owner: site administrator (named operational owner still to be assigned).
Frequency: check at the start of each working day and when a customer reports a missing order update.
Updated: 4 September 2026 UTC. Last rehearsal: local synthetic data, 4 September 2026.

## Purpose and prerequisites

Order events enqueue a customer notice in the same database transaction. The notice directs the customer to their authenticated order page; it does not include private staff notes or bank details. This queue covers order submission, payment changes, cancellation, fulfilment, shipment, returns and refunds. Verification, password-reset, institutional-decision emails and the operations digest are separate and are not durably retried by this feature.

- Sign in with an admin role. Ops and QC roles cannot inspect recipients or handle notices.
- A configured Resend account and permitted sender are needed for actual email. Never paste its API key into handling notes.
- Outside production, the exact recipient must be in TEST_EMAIL_ALLOWLIST. A copied live key does not bypass this restriction. Never add real customers merely to make a staging test pass.
- Staff need access to provider history to resolve uncertain delivery. No provider account or sender verification has been configured by this code change.

## Procedure

1. Open **Dashboard → customer notifications needing attention**, or **Notifications** in the manager navigation. Expected: messages show waiting, sending, retry scheduled, needs attention, provider accepted or handled separately. If the page is unavailable, check application health and database migrations; do not assume the queue is empty.
2. Read the error and expand **Message and handling history**. The page shows the latest 100 matching messages and 200 handling events across those messages. Older records remain in the database. Inspect the provider before resending anything with an uncertain response.
3. For a missing configuration or test-allowlist problem, have the deployment administrator correct the environment through the normal secret/configuration process. Enter a handling note and choose **Retry after configuration fix**. Expected: the message becomes retry scheduled. If rejected, reload: another person may have handled it or the safety window/attempt limit may have expired.
4. The schedule processes up to five due messages every five minutes; **Process up to five due messages** runs the same bounded dispatcher immediately. Expected: provider accepted, retry scheduled, or needs attention. A success banner means the action ran, not that the customer received an email.
5. If delivery remains uncertain, review the original message identifier in provider history and decide whether separate customer contact is needed. Record what was checked, then choose **Mark handled separately**. Expected: handled separately, with the actual signed-in administrator and note recorded. This does not claim the email was sent and does not delete the record.

## Verification and limits

- Provider accepted means the API returned a message identifier. It does **not** prove inbox delivery. Bounce/delivery webhooks are not integrated in this queue.
- Retries preserve the exact original provider payload and idempotency key. Resend retains keys for 24 hours; automatic and manual retries stop at 23 hours after the first recorded attempt, or eight attempts, whichever comes first. Source: [Resend idempotency documentation](https://resend.com/docs/dashboard/emails/idempotency-keys).
- Pending/retry capacity is at most 60 attempts per hour at this schedule. A growing backlog needs capacity review; admin processing can drain additional bounded batches. Do not solve it by duplicating records.
- A worker interrupted while sending leaves a two-minute lease. A later run can reclaim it using the same key and payload. No email body, recipient or credential is logged by the scheduled handler; its log contains counts only.
- Database tests cover atomic enqueue, competing workers, uncertain responses, backoff, expired leases, exhausted limits, invalid payloads and administrator attribution. Local workerd and browser rehearsal additionally cover the built handler, missing-provider failure and manual handling. Actual provider/inbox delivery remains unverified until configured.

## Troubleshooting

| Symptom | Check and action |
| --- | --- |
| Email provider is not configured | Deployment administrator configures RESEND_API_KEY for the intended environment. Retry with an attributed note. |
| Recipient is not allowed | Confirm this is an approved synthetic tester; update TEST_EMAIL_ALLOWLIST only with the owner's approved test addresses. |
| Provider rejection (4xx except 408/429) | Check sender/domain/account configuration. Do not repeatedly retry unchanged requests. |
| Network uncertainty, 408, 429 or 5xx | Automatic retries back off. At the limit, inspect provider history before separate contact. |
| Invalid stored payload | Escalate for data-integrity investigation; do not edit the frozen message and reuse its key. |
| Queue remains waiting | Check deployed cron configuration and scheduled logs. New Cloudflare schedules can take up to 15 minutes to propagate. [Cloudflare cron documentation](https://developers.cloudflare.com/workers/configuration/cron-triggers/). |
| Local scheduled endpoint returns 500 with assets enabled | The pinned local assets router does not forward scheduled events. After a build and matching LOCAL migrations, run `node scripts/smoke-scheduled.mjs`; it targets the built user Worker directly and disables provider delivery. This is a local diagnostic, not a public endpoint. |

## Deployment and rollback

Build and test first; apply additive migrations 0028 and 0029 before deploying this Worker. Migration 0028 is Claude's document foundation; 0029 adds the queue, history and an order-event trigger. There is no historical backfill.

Do not downgrade blindly to a Worker with the old direct-send code: the trigger remains after rollback and will also enqueue its new order events. A later re-upgrade could therefore send those notices again. Before a downgrade, pause order writes and notification delivery through the approved operational change process, inspect provider history, and preserve/resolve affected queue records. Keep migrations and histories; do not drop tables or reset accepted notices. Prefer a forward fix. This staging rollout has no configured email provider, so it cannot send duplicate real emails during the transition.

## Escalation

Configuration, schedule or database failure: deployment administrator. Recipient/handling decision or unresolved customer contact: business owner/admin. Suspected duplicate or misdirected communication: pause further handling and bring the message identifier and non-sensitive error to the owner. Named contacts and provider access still need assignment; none have been invented here.

## History

4 September 2026: Codex ran synthetic local database and browser checks. Provider disabled throughout; no customer contacted. The process-optimization skill guided the handoff checks, frontend-design preserved the existing manager style, and the runbook skill guided failure, verification and escalation instructions.
