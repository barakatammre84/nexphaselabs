# Shippo + USPS live activation

Status: staging rating and one test label passed; the Shippo-provided USPS account is enabled; automatic tracking ingestion is deployed; and the test `track_updated` webhook is active. A controlled test tracking event, live key, and live acceptance evidence remain.

## Account decision

Shippo automatically supplies discounted USPS access to every Shippo account. The separate USPS business account is therefore not required for NexPhase to quote USPS or buy labels through Shippo. If NexPhase has negotiated USPS rates that must be used, Shippo instructs the account owner to contact Shippo Support to have those rates hosted. Do not give USPS credentials to the application unless Shippo Support explicitly requires an approved connection flow.

The app should continue using Shippo as the single carrier API. This keeps USPS labels, tracking, void/refund reconciliation, and future UPS/FedEx comparisons in one controlled integration.

## Information required from the account owner

- Create or expose a Shippo **live** API key only when the live-label rehearsal is approved. The full key is shown once and must go directly into Cloudflare secrets.
- Confirm whether the automatic Shippo USPS account will be used (recommended initially) or whether NexPhase has a negotiated USPS contract that Shippo Support must host.
- Confirm the provisional 8 × 6 × 4 inch packed parcel and weight rule, Ground Advantage/Priority allowlist, return address, pickup/drop-off procedure, and any material-specific carrier restriction.

## Automatic tracking controls

The app accepts only `track_updated` events at:

`https://<environment-origin>/api/webhooks/shippo/tracking?token=<random-secret>`

Shippo’s published webhook configuration does not expose a signing-secret field. The app therefore requires a random URL token of at least 32 characters and independently fetches the current tracking record from Shippo before changing an order. It also requires the tracking number, carrier, test/live mode, and Shippo transaction to match the active label. Raw webhook payloads are not retained.

Create two separate Shippo webhook records:

| Environment | Event | Test flag | URL origin |
| --- | --- | --- | --- |
| Staging | `track_updated` | test | `https://nexphaselabs-staging.nexphase.workers.dev` (re-registered after the 16 Sep account move; the old `ammre` host no longer answers) |
| Production | `track_updated` | live | `https://nexphaselabs.net` |

Each environment receives a different `SHIPPO_WEBHOOK_TOKEN` secret. Do not reuse the API key as the URL token. A duplicate event is stored once. Transit is recorded, delivered status can close the delivery checkpoint, and failure/return/unmatched events appear under **Internal → Readiness → Tracking events needing review**.

## Controlled activation sequence

1. Sign into Shippo and verify **Carrier accounts** shows an active USPS account. Record its object ID, whether it is Shippo-provided, and its test/live flag.
2. Set a staging webhook token in Cloudflare, register the staging webhook in Shippo, and deploy migration 0049 plus the Worker.
3. Trigger a Shippo test tracking status. Confirm the event is independently verified and appears once in staging.
4. Run a synthetic shipped order to delivered; confirm the order history names `Shippo tracking webhook (system)` and the readiness exception queue is empty.
5. Before live postage, set the live Shippo key, rediscover the live carrier-account ID, and set `LIVE_SHIPPING_ENABLED=true` only for the approved rehearsal window.
6. Buy one authorized live label, tender it to USPS, confirm its first carrier scan, delivery event, invoice charge, and any void/refund test. Record all provider references.
7. Leave production closed if any event is unmatched, any charge cannot be reconciled, sender information is rejected, or the service/material policy is unresolved.

### Activation record — 9 September 2026

- Shippo carrier accounts showed USPS as enabled.
- A distinct random staging webhook token was installed as a protected Worker secret.
- One active Shippo test webhook was registered for `track_updated` at the staging endpoint.
- The endpoint rejected an invalid probe as expected; a genuine Shippo test tracking update and automatic delivered-order transition are still required for acceptance.
- No live key, live webhook, live label, production secret, or production setting was created or changed.

Official references: [Shippo USPS FAQ](https://support.goshippo.com/hc/en-us/articles/360035423651-USPS-and-Shippo-FAQs), [Shippo carrier accounts](https://docs.goshippo.com/api-reference/carrier-accounts/list-all-carrier-accounts), [Shippo tracking lookup](https://docs.goshippo.com/api-reference/tracking-status/get-a-tracking-status), and [Shippo webhook creation](https://docs.goshippo.com/api-reference/webhooks/create-a-new-webhook).
