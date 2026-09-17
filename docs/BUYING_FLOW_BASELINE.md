# Critical buying-flow baseline

This is the repeatable pre-fix check for the storefront. It separates an
existing production failure from a regression introduced by a bug fix without
creating customer data or contacting a customer.

## Run it

The URL and environment are always explicit. Obtain the production URL from
the current deployment metadata; do not infer it from a local environment
variable or from a source file.

```sh
# Published production origin
npm run baseline:store -- \
  --base-url https://<published-production-origin> \
  --environment production

# Isolated staging origin
npm run baseline:store -- \
  --base-url https://<staging-origin> \
  --environment staging

# Local server
npm run db:migrate:local
npm run db:seed:local
npm run baseline:store -- \
  --base-url http://127.0.0.1:5000 \
  --environment local
```

The current production/staging expectation is that an account is required for
prices, released-lot availability, and the cart. An intentionally anonymous
pricing environment must opt into a different contract:

```sh
npm run baseline:store -- \
  --base-url http://127.0.0.1:5000 \
  --environment development \
  --anonymous-pricing
```

The production baseline never signs in. To verify the customer path in an
isolated staging environment, opt into the signed-in rehearsal and provide a
synthetic, already-verified account through the process environment. Do not
put the password in shell history or a command argument:

```sh
STAGING_BUYING_BASELINE_EMAIL='synthetic@example.invalid' \
STAGING_BUYING_BASELINE_PASSWORD='use-the-staging-account-password' \
npm run baseline:store -- \
  --base-url https://<staging-origin> \
  --environment staging \
  --signed-in
```

The signed-in rehearsal signs in, adds one available catalog pack to that
account's cart, opens the signed-in cart checkout, and requests delivery/tax
quotes. It accepts only test quotes and stops before `POST /api/orders`, so it
does not create an order, start payment, send email, buy a label, or contact a
live payment/shipping provider. Because it uses the account's staging cart,
repeat runs may leave one test pack in that cart; the check only adds one pack
per run.

Use `--json` when saving evidence for a release or bug report. Every result
includes `environment`, `route`, HTTP status when available, and a
route-specific detail. The command exits non-zero if any required check fails.

## Read-only contract

| Flow                          | Read-only request                            | Expected outcome                                                                                      |
| ----------------------------- | -------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| Browse home                   | `GET /`                                      | HTTP 200 with the storefront shell                                                                    |
| Browse catalog                | `GET /catalog`                               | HTTP 200 with catalog content                                                                         |
| Pricing visibility            | `GET /catalog` and one linked product        | With account-required pricing, the sign-in boundary is visible and anonymous dollar prices are absent |
| Account access                | `GET /account/sign-in`                       | HTTP 200 with the email/password sign-in form                                                         |
| Private account boundary      | `GET /account`                               | Redirect to `/account/sign-in` without a session                                                      |
| Cart page                     | `GET /account/cart`                          | Redirect to `/account/sign-in` without a session                                                      |
| Cart API                      | `GET /api/cart`                              | HTTP 401 JSON response with a sign-in target; no cart mutation                                        |
| Checkout eligibility boundary | `GET /api/checkout/quotes`                   | HTTP 405; the quote POST flow is not attempted                                                        |
| Worker health                 | `GET /api/health`                            | HTTP 200 with `ok: true`                                                                              |

The optional signed-in staging rehearsal adds these assertions:

| Flow | Request | Expected outcome |
| --- | --- | --- |
| Sign in | `POST /api/account/sign-in` | HTTP 303 to `/account/cart` with an account session |
| Signed-in cart | `GET /api/cart` and `GET /account/cart` | HTTP 200, a non-empty synthetic cart, and the checkout form up to “Continue to payment” |
| Shipping quote | `POST /api/checkout/quotes` | HTTP 200 with one or more `test: true` delivery/tax quotes |
| Order/payment safety | no request to `/api/orders` or payment routes | no order or payment effect is attempted |

The anonymous baseline intentionally does not sign in, create an account,
submit a cart, request a checkout quote, send an email, create an order,
purchase a label, confirm payment, or call a provider. The signed-in rehearsal
is available only in isolated staging and uses a synthetic identity plus
explicit test quote controls; it still stops before order creation and payment.

The local seed command also applies `drizzle/seed/local-baseline.sql`. That
generated file contains one clearly synthetic, published product with a priced
5 mg variant and a publishable released lot, so the local baseline exercises
`/catalog/synthetic-baseline-material` instead of silently accepting an empty
catalog. The fixture uses the local D1 database only; the staging and production
seed commands apply `catalog.sql` but never apply `local-baseline.sql`.

## Failure handling

Record the full JSON output with the commit or deployment identifier being
compared. A failure such as `[production] /api/cart` identifies the affected
environment and route directly. Do not “fix” a baseline by weakening an
expected outcome without confirming the storefront configuration and updating
the contract.
