# Commerce analytics staging verification

## Status

**Blocked — no live delivery or production-isolation result yet.**

The owner approved a temporary staging-only check through the existing GitHub
staging deployment process, using synthetic cart, order and newsletter records,
and restoring collection to disabled afterward. This is not production activation
approval, counsel approval, or approval to send policy notices.

Repository inspection confirms the fixed schema and intended separation:

- `lib/commerce-events.ts`: `indexes: ["commerce_v1"]`,
  `blobs: [event name, source]`, `doubles: [1, quantity]`.
- `wrangler.jsonc`: staging uses `nexphase_commerce_staging`; production uses
  `nexphase_commerce`. Both checked-in collection flags are `"false"`.
- These are source observations, not observations of deployed settings.

The approved GitHub connection returned HTTP 404 for this project's repository
and its workflows while authenticated account requests succeeded. The local
GitHub CLI was not authenticated; a remote-ref check timed out. No deployment,
flag change, synthetic mutation, policy notice or production write was performed.
GitHub repository access and Cloudflare query access remain unverified.

## Required access and safety gates

- Restore the connected GitHub account's access to the configured store repository,
  including the staging workflow. Inspect the remote revision and workflow before
  dispatching; local files do not prove what GitHub will execute.
- Confirm Cloudflare Analytics Engine product access for the configured account.
  If Cloudflare presents an activation/access step, the owner must complete it.
  A binding alone does not collect events; a dataset is created on first write.
- Use a short-lived, account-restricted **Account → Account Analytics → Read**
  token for the SQL API. A Workers deployment token does not necessarily have
  this permission. Store credentials only in the approved secret store; never
  put them in source, command arguments, evidence, chat, or logs.
- Keep deployment credentials in the existing GitHub staging process. Do not
  extract GitHub secrets or request a global Cloudflare API key.
- Read deployed staging bindings and flags and production bindings and flags
  through approved read-only access. Confirm the staging D1/R2 targets as well
  as the Analytics Engine dataset. Save only allowlisted non-secret metadata.
- Confirm synthetic fixtures are not real customers, recipients are not allowed
  to receive mail, and no payment or shipping-label action will be invoked.
  Do not reuse a real account merely because staging can authenticate it.
- Use a controlled window without unrelated staging mutations. Staging is
  configured as public, and anonymous events have no fixture/session identifier:
  concurrent traffic cannot reliably be subtracted or attributed to this test.
  If isolation cannot be established, report the counts as inconclusive.
- Inspect pending staging migrations before using the existing workflow: it
  applies D1 migrations and seeds reference data. Stop for separate approval if
  unrelated or destructive changes would be included.

## Deterministic acceptance sequence

Run only after access, deployed configuration, synthetic-data safety and privacy
review are confirmed. Use application mutation paths, not a stand-alone emitter:
direct binding writes alone would not prove application event semantics.

Start with an empty synthetic cart and record a UTC start time after deployment
and its automatic browser checks finish. Record a UTC end time after the last
mutation. Keep setup, cleanup and restoration outside that interval.

| Synthetic action | Expected event | Source | Count | Quantity sum |
| --- | --- | --- | ---: | ---: |
| Add 2 units, then add 3 to the same line | `cart_item_added` | `storefront` | 2 | 5 |
| Set that line from 5 to 4 | `cart_quantity_updated` | `storefront` | 1 | 4 |
| Set the same line to 4 again | none | — | 0 | 0 |
| Remove the line holding 4 units | `cart_item_removed` | `storefront` | 1 | 4 |
| Remove the already-removed line again | none | — | 0 | 0 |
| Commit one synthetic order through the application | `order_submitted` | `storefront` | 1 | 0 |
| Replay the same order idempotency key | none | — | 0 | 0 |
| Store one new newsletter request | `newsletter_request_accepted` | original request source | 1 | 0 |
| Confirm that request once | `newsletter_confirmed` | original request source | 1 | 0 |
| Revoke that consent once | `newsletter_unsubscribed` | original request source | 1 | 0 |
| Repeat confirm before revocation; repeat unsubscribe after revocation | none | — | 0 | 0 |

Exercise the newsletter sequence separately for `footer`, `account`, and
`sign_up`, retaining the original source through confirmation and revocation.
Do not send confirmation mail to obtain a link: use an approved staging-only
fixture mechanism, handling any synthetic bearer tokens privately. If that
mechanism is unavailable, the associated transition remains unverified.

For these sequences together, expected totals are **14 events**: 2 adds,
1 update, 1 removal, 1 order, and 9 newsletter transitions. Quantities must be
compared per event, not combined across events. Set up the order cart before
the measured interval or explicitly add its mutations to the expected table.
Verify a rejected mutation emits nothing in a separate controlled window.
Repeated pending newsletter requests can legitimately emit another request event
when a new request is stored; they are not a no-op assertion.

No order settlement, payment claim, charge, refund, label purchase or customer
email is part of this check. An order event means submitted, not paid.

## Queries and interpretation

Submit SQL bodies to the documented Analytics Engine SQL endpoint through
approved credential handling. Replace the two time placeholders with the actual
UTC bounds; do not run a rolling-window query as an exact fixture comparison.

```sql
SELECT
  blob1 AS event_name,
  blob2 AS source,
  SUM(_sample_interval * double1) AS event_count,
  SUM(_sample_interval * double2) AS aggregate_quantity,
  MIN(_sample_interval) AS minimum_sample_interval,
  MAX(_sample_interval) AS maximum_sample_interval
FROM nexphase_commerce_staging
WHERE index1 = 'commerce_v1'
  AND timestamp >= toDateTime('<UTC_START>')
  AND timestamp < toDateTime('<UTC_END>')
GROUP BY event_name, source
ORDER BY event_name, source
```

Also inspect the schema within that window without filtering out unexpected
indexes or event names. Check the fixed index; allowed event/source values;
`double1 = 1`; nonnegative integral `double2`; and unused blob/double columns.
Return only mismatch counts for unexpected values, not potentially sensitive
contents. Analytics Engine exposes fixed columns: empty unused columns do not
by themselves prove the original array lengths; pair live column checks with
the deployed revision's emitter contract.

Use sample-weighted counts and quantities, never raw row counts as event counts.
Save the sample-interval range. Exact small-fixture equality is useful when
intervals are 1; sampled results are estimates, not an exact audit. Do not
invent a tolerance to convert a mismatch into a pass. Investigate discrepancies,
wait for ingestion with bounded retries, or mark the result inconclusive.

Query production separately for the same UTC window, using
`nexphase_commerce`, with no writes. Confirm the production flag remains off
and its binding targets only the production dataset. Record before/after
deployment metadata and weighted counts. Unexpected production events require
investigation; aggregate counts alone cannot identify an individual synthetic
event. If the production dataset does not yet exist, retain the authenticated
dataset-discovery result and configuration evidence. An authorization error or
failed query is not evidence of an empty dataset.

## Owner activation checklist

- [ ] Staging evidence passes: deployed revision, UTC bounds, action outcomes,
  expected/observed weighted counts, schema mismatch counts and sampling status.
- [ ] Production isolation is verified through read-only configuration and
  dataset evidence, not inferred solely from checked-in configuration.
- [ ] Staging collection is restored to disabled and the deployed privacy page
  reflects that state. Verify restoration even if an acceptance check fails.
  Retained events are not erased by disabling collection; retention still applies.
- [ ] Owner reviews enabled privacy wording in sections 2, 3, 5 and 7, including
  anonymous scope, purpose, no browser script/cookie, and three-month retention.
- [ ] Review `PRIVACY_VERSION` when visible wording changes, including changes
  caused by a flag. Do not assume the existing version is sufficient for activation.
- [ ] Obtain review of changed wording before retaining
  `POLICIES_COUNSEL_REVIEWED=true`; historical approval is not new approval.
- [ ] Owner/counsel decides whether the policy's section 12 obligation applies:
  changes affecting use of information already held must be announced to account
  holders by email before taking effect. Do not send notices automatically.
- [ ] Cloudflare product access, query permissions, retention and operational
  ownership are confirmed. Counts remain best-effort, not a financial ledger.
- [ ] Any later production activation receives separate explicit approval and
  follows the existing production release process. This staging approval does
  not authorize it.

Checklist status: **prepared for owner review; not signed off or executed**.
Attach only sanitized evidence. No customer data, credentials, cookies,
confirmation links, raw database dumps or unfiltered request/response logs.

## References

- [Project event contract](COMMERCE-ANALYTICS.md)
- [Existing deployment process](DEPLOY.md)
- [Cloudflare get started](https://developers.cloudflare.com/analytics/analytics-engine/get-started/)
- [Cloudflare SQL API](https://developers.cloudflare.com/analytics/analytics-engine/sql-api/)
- [Cloudflare sampling](https://developers.cloudflare.com/analytics/analytics-engine/sampling/)
- [Cloudflare retention limits](https://developers.cloudflare.com/analytics/analytics-engine/limits/)