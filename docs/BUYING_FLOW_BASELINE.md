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

Use `--json` when saving evidence for a release or bug report. Every result
includes `environment`, `route`, HTTP status when available, and a
route-specific detail. The command exits non-zero if any required check fails.

## Read-only contract

| Flow                          | Read-only request                                     | Expected outcome                                                                                      |
| ----------------------------- | ----------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| Browse home                   | `GET /`                                               | HTTP 200 with the storefront shell                                                                    |
| Browse catalog                | `GET /catalog`                                        | HTTP 200 with catalog content                                                                         |
| Pricing visibility            | `GET /catalog` and one linked product, when available | With account-required pricing, the sign-in boundary is visible and anonymous dollar prices are absent |
| Account access                | `GET /account/sign-in`                                | HTTP 200 with the email/password sign-in form                                                         |
| Private account boundary      | `GET /account`                                        | Redirect to `/account/sign-in` without a session                                                      |
| Cart page                     | `GET /account/cart`                                   | Redirect to `/account/sign-in` without a session                                                      |
| Cart API                      | `GET /api/cart`                                       | HTTP 401 JSON response with a sign-in target; no cart mutation                                        |
| Checkout eligibility boundary | `GET /api/checkout/quotes`                            | HTTP 405; the quote POST flow is not attempted                                                        |
| Worker health                 | `GET /api/health`                                     | HTTP 200 with `ok: true`                                                                              |

The baseline intentionally does not sign in, create an account, submit a cart,
request a checkout quote, send an email, create an order, purchase a label,
confirm payment, or call a provider. Authenticated checkout and payment
rehearsal belong in isolated staging with synthetic identities and explicit
test-payment controls.

## Failure handling

Record the full JSON output with the commit or deployment identifier being
compared. A failure such as `[production] /api/cart` identifies the affected
environment and route directly. Do not “fix” a baseline by weakening an
expected outcome without confirming the storefront configuration and updating
the contract.
