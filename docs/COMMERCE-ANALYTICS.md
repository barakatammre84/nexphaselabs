# Anonymous commerce analytics

## Status and purpose

Commerce analytics is configured for Cloudflare Workers Analytics Engine, not Replit. It is **disabled initially** in production and staging:

- `COMMERCE_ANALYTICS_ENABLED` must equal the exact string `"true"` before the server sink writes.
- The owner must review the privacy-policy change before enabling it.
- Enabling the flag/config is an ordinary, owner-reviewed deployment through the existing Cloudflare process. This repository change does not enable production, publish a Worker or create a migration.
- Production writes to `nexphase_commerce`; staging writes to the isolated `nexphase_commerce_staging` dataset. Never combine the two when reporting.

Cloudflare says a dataset is created automatically on the first write after its binding is defined; it does not need to be created manually in the dashboard. If the account presents an Analytics Engine product-access or activation step, the owner must complete that in the Cloudflare account before the reviewed deployment. See Cloudflare's [Get started guide](https://developers.cloudflare.com/analytics/analytics-engine/get-started/) and [Analytics Engine overview](https://developers.cloudflare.com/analytics/analytics-engine/).

Until the owner activates the flag and publishes through the existing Cloudflare process, no commerce events are collected. The binding alone does not write data.

## Immutable event contract

Every data point has exactly this shape:

| Analytics Engine field | Value |
| --- | --- |
| `indexes` | `["commerce_v1"]` |
| `blobs` | `[event name, source]` |
| `doubles` | `[1, quantity]` |

`double1` is the count contribution and is always `1`. `double2` is the aggregate quantity and is `0` when quantity is omitted. The only permitted sources are:

- `storefront`
- `sign_up`
- `account`
- `footer`

The only permitted events are:

- `cart_item_added`
- `cart_quantity_updated`
- `cart_item_removed`
- `order_submitted`
- `newsletter_request_accepted`
- `newsletter_confirmed`
- `newsletter_unsubscribed`

### Event meanings

| Event | Counted after | Quantity (`double2`) |
| --- | --- | --- |
| `cart_item_added` | A pack is added or an existing cart line is increased | Added quantity, not the line total |
| `cart_quantity_updated` | An existing line changes to a different positive quantity | New resulting quantity, not the change |
| `cart_item_removed` | A line is actually deleted; clearing emits once per deleted line | Removed quantity |
| `order_submitted` | A new order transaction commits | Not used |
| `newsletter_request_accepted` | A new or renewed confirmation request is stored | Not used |
| `newsletter_confirmed` | Consent transitions to confirmed | Not used |
| `newsletter_unsubscribed` | Consent transitions to revoked | Not used |

Cart/order sources are `storefront`. Newsletter source is the consent request's
stored source, not the page or mechanism used for a later confirmation/unsubscribe.
Repeat requests for a pending confirmation can count again if a new request is stored;
this event is not a unique-subscriber count and does not promise email delivery.
Failed mutations, unchanged cart quantities, order idempotency replays, repeated
unsubscribes and provider-sync retries do not emit new outcome events.

Do not add quantities across different event types: update quantities are snapshots,
not increments, and cart quantities do not measure units sold.

This schema is intentionally anonymous and fixed. Do not add order IDs, customer IDs, prices, URLs, IP addresses, email addresses, free-form strings or any other customer details. There are no paid-purchase events: `order_submitted` means only that an order was submitted, not paid or settled. No browser analytics library, cookie, pixel or other tracker is part of this feature.

Because there is no person, session, cart or order identifier, the dataset supports aggregate counts only. It cannot produce customer-level funnels or connect one event to another.

Cloudflare's [`writeDataPoint()` data model](https://developers.cloudflare.com/analytics/analytics-engine/get-started/#2-write-data-points-from-your-worker) explains indexes, blobs and doubles.

## Querying

Cloudflare's current documentation exposes Analytics Engine queries through the [SQL API](https://developers.cloudflare.com/analytics/analytics-engine/sql-api/), as well as documented integrations such as Grafana and queries from a Worker. The dashboard is used to create a custom API token; the current Analytics Engine documentation does not describe a dashboard SQL editor, so do not rely on or invent one.

In the Cloudflare dashboard's [API Tokens page](https://dash.cloudflare.com/profile/api-tokens), create a custom token with **Account → Account Analytics → Read**, restricted to the appropriate account and with the narrowest practical lifetime and IP restrictions. Keep the token out of the repository and shell history. No credential is required in Worker configuration merely to write through the binding.

The endpoint documented by Cloudflare is:

```text
POST https://api.cloudflare.com/client/v4/accounts/{account_id}/analytics_engine/sql
Authorization: Bearer <API_TOKEN>
```

For production, an aggregate query is:

```sql
SELECT
  blob1 AS event_name,
  blob2 AS source,
  SUM(_sample_interval * double1) AS event_count,
  SUM(_sample_interval * double2) AS aggregate_quantity
FROM nexphase_commerce
WHERE index1 = 'commerce_v1'
  AND timestamp >= NOW() - INTERVAL '7' DAY
GROUP BY event_name, source
ORDER BY event_name, source
```

Use `nexphase_commerce_staging` instead for staging. Submit the SQL as the request body, following Cloudflare's SQL API example:

```bash
curl "https://api.cloudflare.com/client/v4/accounts/{account_id}/analytics_engine/sql" \
  --header "Authorization: Bearer <API_TOKEN>" \
  --data-binary @query.sql
```

Always use `SUM(_sample_interval * double1)` for event counts, rather than `COUNT(*)` or `SUM(double1)`, and apply the same sample weighting to aggregate quantity. Cloudflare Analytics Engine can sample on write and read; see [Sampling with Workers Analytics Engine](https://developers.cloudflare.com/analytics/analytics-engine/sampling/). These are sampled, best-effort operational measurements, not an order register, payment record, inventory source of truth or financial ledger.

## Retention and privacy

Cloudflare documents a fixed **three-month retention period** in the [Analytics Engine limits](https://developers.cloudflare.com/analytics/analytics-engine/limits/). The privacy policy conditionally discloses whether collection is enabled, what the anonymous counters contain, their purpose and retention, and that the feature adds no cookie or browser script.

Do not enable the flag unless the owner has reviewed that notice and is ready to publish it through the existing Cloudflare deployment process. Do not add a D1 table or migration for analytics.