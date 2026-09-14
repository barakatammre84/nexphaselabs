# Chase Zelle payment setup

The store supports Zelle through `orders@nexphaselabs.net`. Zelle is treated as
an external bank transfer: a customer claim never marks an order paid. A receipt
fetched directly from the controlled Gmail mailbox must be matched first.

## Rollout modes

`ZELLE_MODE` is the operating switch:

- `disabled`: checkout does not offer Zelle and the inbox job does not run.
- `manual`: checkout offers Zelle; staff verifies Chase and records payment.
- `shadow`: Gmail receipts are parsed and proposed, but never change an order.
- `supervised`: exact matches wait for one staff approval in the Zelle payment desk.
- `automatic`: only an authenticated completed receipt with one exact order memo,
  exact USD total, eligible awaiting order, unused Gmail message, and valid stock
  reservation posts automatically. Every other receipt remains in review.

Move through the modes in order. Do not start in `automatic`.

## Values to verify in Chase

1. In Chase, confirm `orders@nexphaselabs.net` is the enrolled Zelle identity.
2. Record the exact recipient business name Chase shows to a sender. Set that
   text as `ZELLE_RECIPIENT_NAME`; do not abbreviate or infer it.
3. Send one controlled low-value transfer and inspect the received Gmail
   message. Record the exact From address as `ZELLE_CHASE_SENDERS`.
4. Confirm the message preserves the full `NX-YYMMDD-NNNN` memo, amount,
   completed/received language, To or Delivered-To alias, DKIM pass, and DMARC
   pass. Keep the sample in the controlled mailbox; do not paste its body into
   source code.
5. Export the official QR image from Chase, put it at
   `public/payments/chase-zelle-qr.png`, and set
   `ZELLE_QR_IMAGE_PATH=/payments/chase-zelle-qr.png`. The QR is optional until
   the real Chase asset is available; never generate a replacement payload.

## Read-only Gmail authorization

The existing transactional-mail token is send-only and must stay that way.
Create a second internal OAuth authorization for the licensed mailbox receiving
the `orders@` alias, with exactly this scope:

`https://www.googleapis.com/auth/gmail.readonly`

The same internal OAuth client may be used, but the refresh token must be the
separate read-only grant. Store the following as protected Cloudflare secrets:

```text
ZELLE_GMAIL_OAUTH_CLIENT_SECRET=<OAuth client secret>
ZELLE_GMAIL_OAUTH_REFRESH_TOKEN=<read-only offline refresh token>
```

Set these non-secret values in the deployment configuration:

```text
ZELLE_RECIPIENT_EMAIL=orders@nexphaselabs.net
ZELLE_RECIPIENT_NAME=<exact Chase-displayed business name>
ZELLE_GMAIL_MAILBOX=<licensed mailbox receiving the orders alias>
ZELLE_CHASE_SENDERS=<exact Chase sender address, comma separated if more than one>
ZELLE_GMAIL_OAUTH_CLIENT_ID=<internal OAuth client id>
ZELLE_QR_IMAGE_PATH=/payments/chase-zelle-qr.png
ZELLE_MODE=manual
```

If `ZELLE_GMAIL_OAUTH_CLIENT_ID` or its client secret is omitted, the reader may
use the corresponding Google Workspace transactional-mail client value. It
still requires the separate `ZELLE_GMAIL_OAUTH_REFRESH_TOKEN`.

## How matching runs

The existing Cloudflare scheduled job runs every five minutes. It searches a
seven-day window on the first run and a one-day overlap thereafter, fetches only
messages from the configured Chase sender addresses, and stores only parsed
payment fields and hashes. Raw email bodies are not retained.

Staff can run the same bounded synchronization from **Internal → Zelle**. That
page shows configuration health, the last successful sync, matched receipts,
possible duplicates, refund obligations, and receipts needing review.

## Acceptance sequence

1. Apply the database migration to staging and production before deploying code.
2. Use `manual` for five end-to-end orders and reconcile every Chase credit.
3. Use `shadow` for at least 25 real receipts, including repeated totals and a
   missing memo. Require zero false proposed matches.
4. Use `supervised` for at least 50 approved receipts. Confirm duplicate Gmail
   processing does not repeat the order event or customer notification.
5. Rehearse missing memo, wrong amount, duplicate payment, payment after
   cancellation, expired inventory reservation, failed authentication, changed
   Chase wording, Gmail outage, refund, and customer double-click cases.
6. Enable `automatic` only after the exact-match rules remain stable. Keep daily
   Chase reconciliation and the emergency switch back to `supervised`.

Verified payment moves an order into the existing paid queue. Lot selection,
packing checks, Shippo label purchase, tracking, delivery, returns, and refunds
continue through the existing controlled workflow; a receipt does not buy a
shipping label by itself.

Current production identity: `8486 llc`, confirmed by the owner on 14 September
2026. When Chase completes the future DBA change, switch Zelle off, update this
value to the new exact Chase display, verify it with a controlled transfer, and
then turn checkout back on. Existing orders retain their order number and payment
evidence throughout that change.
