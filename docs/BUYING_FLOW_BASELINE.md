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

# Local browser boundary
npm run baseline:store:browser:pricing -- \
  --base-url http://127.0.0.1:5000
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

For the rendered-form and browser-network boundary, run the staging browser
rehearsal with the same synthetic account:

```sh
STAGING_BUYING_BASELINE_EMAIL='synthetic@example.invalid' \
STAGING_BUYING_BASELINE_PASSWORD='use-the-staging-account-password' \
npm run baseline:store:browser -- \
  --base-url https://<staging-origin>
```

This launches Chromium, accepts the first-party research-use entry notice when
needed, signs in through the real form, adds one available pack through the
catalog form, fills the checkout address, selects a returned `test: true`
quote, and stops with “Continue to payment” visible. It does not click that
button. Browser network evidence records every non-GET request and fails if an
order, payment, email, or shipping-label route is requested. Use `--json` to
save the route-specific evidence. The command is staging-only and requires an
HTTPS origin; set `BROWSER_EXECUTABLE_PATH` when Chromium is not at the standard
Replit path.

Before launching Chromium, the browser command performs a staging buyer
preflight against `POST /api/account/sign-in`. It checks the redirect target and
session cookie without printing the email or password. A successful preflight
must report `ready`; a failed preflight blocks the browser rehearsal and marks
the checkout and payment checks as not run. The route-specific failure state
identifies the repair path:

| State | Meaning |
| --- | --- |
| `missing` | One or both staging credential secrets are not configured |
| `unverified` | The synthetic account needs its email confirmed |
| `expired` | The staging credential or verification state needs renewal |
| `invalid` | The staging email/password or account record was rejected |
| `locked`, `suspended`, `throttled` | The staging account or sign-in service must be made usable before rehearsal |

The preflight never treats an unsuccessful sign-in as partial checkout evidence,
and it does not expose the configured account values in human-readable or JSON
output.

Use `--json` when saving evidence for a release or bug report. Every result
includes `environment`, `route`, HTTP status when available, and a
route-specific detail. The command exits non-zero if any required check fails.

## Read-only contract

| Flow                          | Read-only request                     | Expected outcome                                                                                      |
| ----------------------------- | ------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| Browse home                   | `GET /`                               | HTTP 200 with the storefront shell                                                                    |
| Browse catalog                | `GET /catalog`                        | HTTP 200 with catalog content                                                                         |
| Pricing visibility            | `GET /catalog` and one linked product | With account-required pricing, the sign-in boundary is visible and anonymous dollar prices are absent |
| Account access                | `GET /account/sign-in`                | HTTP 200 with the email/password sign-in form                                                         |
| Private account boundary      | `GET /account`                        | Redirect to `/account/sign-in` without a session                                                      |
| Cart page                     | `GET /account/cart`                   | Redirect to `/account/sign-in` without a session                                                      |
| Cart API                      | `GET /api/cart`                       | HTTP 401 JSON response with a sign-in target; no cart mutation                                        |
| Checkout eligibility boundary | `GET /api/checkout/quotes`            | HTTP 405; the quote POST flow is not attempted                                                        |
| Worker health                 | `GET /api/health`                     | HTTP 200 with `ok: true`                                                                              |

The optional signed-in staging rehearsal adds these assertions:

| Flow                 | Request                                       | Expected outcome                                                                        |
| -------------------- | --------------------------------------------- | --------------------------------------------------------------------------------------- |
| Sign in              | `POST /api/account/sign-in`                   | HTTP 303 to `/account/cart` with an account session                                     |
| Signed-in cart       | `GET /api/cart` and `GET /account/cart`       | HTTP 200, a non-empty synthetic cart, and the checkout form up to “Continue to payment” |
| Shipping quote       | `POST /api/checkout/quotes`                   | HTTP 200 with one or more `test: true` delivery/tax quotes                              |
| Order/payment safety | no request to `/api/orders` or payment routes | no order or payment effect is attempted                                                 |

The browser rehearsal adds these rendered and network assertions:

| Flow | Browser evidence | Expected outcome |
| --- | --- | --- |
| Payment guard | Disabled “Continue to payment” before a quote | The handoff cannot be reached before delivery is selected |
| Quote selection | Selected quote radio and hidden `checkout_quote` value | A returned `test: true` quote is selected in the rendered form |
| Payment boundary | Visible Payment step, test-environment banner, and enabled “Continue to payment” | The browser reaches the payment boundary without submitting the order |
| Network safety | All browser non-GET requests | No order, payment, email, or shipping-label route is requested |

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

The local browser boundary check uses a fresh Chromium profile, opens the
seeded product route, accepts the research-use entry notice, and confirms the
product remains usable. It also checks that the anonymous sign-up boundary is
still visible, no dollar price is visible, and the `nx_entry` browser cookie was
set. It is intentionally separate from the read-only HTTP baseline because the
entry notice is client-side behavior. Chromium must be available on `PATH`; set
`CHROMIUM_PATH` when it is installed elsewhere.

## Failure handling

Record the full JSON output with the commit or deployment identifier being
compared. A failure such as `[production] /api/cart` identifies the affected
environment and route directly. Do not “fix” a baseline by weakening an
expected outcome without confirming the storefront configuration and updating
the contract.
