# Threat Model — NexPhase Labs Store

## Project Overview

NexPhase Labs is a live e-commerce store selling lab/research chemicals. Stack:
Next.js app-router served via `vinext` on **Cloudflare Workers** (`worker.ts`,
`wrangler.jsonc`), with **Cloudflare D1** (SQLite) accessed through `drizzle-orm`
(`db/`, `lib/`). PDFs generated with `pdf-lib`. Deployed to Cloudflare
(`nexphaselabsnet.replit.app` and a custom domain). Two audiences: public/
customer storefront and an internal staff console under `/manage`. Payments are
manual (ACH, Zelle, BTCPay/crypto); card processing is not yet enabled.

## Assets

- **Customer accounts & sessions** — emails, PBKDF2 password hashes, `nx_account`
  session tokens (stored hashed). Compromise = impersonation, order/PII access.
- **Staff accounts & sessions** — `nx_staff` sessions, roles (admin/qc/ops) with
  fine-grained permission keys. Compromise = full back-office control.
- **Order & PII data** — orders, shipping addresses, org verification documents,
  lot documents, invoices, packing slips.
- **Payment/financial data** — Zelle/BTCPay references and reconciliation state,
  refund records, lot costs, affiliate/coupon data.
- **Application secrets** — D1 binding, email (Brevo) keys, shipping provider
  (USPS/Shippo) keys, BTCPay/Zelle config, `STAGING_ACCESS_PASSWORD`, Turnstile
  keys, Google OAuth secrets. Held as Worker secrets / `.dev.vars` (not in bundle).

## Trust Boundaries

- **Browser → Worker API** — all client requests. Untrusted; every request must
  authenticate and authorize server-side. State-changing routes verify
  `sameOrigin(request)` (CSRF defense).
- **Worker → D1** — all queries use parameterized Drizzle templates.
- **Worker → external services** — Brevo, USPS, Shippo, BTCPay, Google OAuth.
  Outbound URLs are fixed/allowlisted; inbound webhooks are token/signature gated.
- **Public vs Authenticated** — storefront/catalog + released lot analytics are
  public; account & order data require `getAccountFromRequest`/guest recovery.
- **Customer vs Staff (`/manage`)** — staff routes require `getStaffFromRequest`
  plus a capability helper (`canManageFinance`, `canFulfil`, `canManageStaff`,
  `canRecordResults`, `canHandleFeedback`, …), not merely authentication.
- **Non-production gate** — `lib/environment-gate.ts` fails **closed** (503) when
  `STAGING_ACCESS_PASSWORD` is missing; open staging is an explicit opt-in.

## Scan Anchors

- **Production entry points**: `app/api/**/route.ts`, `app/**/route.ts`,
  `app/manage/**/actions.ts` (server actions), `worker.ts` (edge dispatch/gate).
- **Highest-risk areas**: `app/api/manage/**` (staff authz), `app/api/orders/**`
  and `lib/orders*`/`order-reads` (customer IDOR), payments (`lib/payments.ts`,
  `payments-core`, `refund-shares`, `manual-payment-rules`, `zelle-config`,
  `app/api/manage/payments/**`, `app/api/manage/orders/*/refund|paid|reconcile`),
  document downloads (`app/api/orders/*/documents`, `app/api/lots/*/documents`,
  `app/api/manage/organizations/*/documents`), uploads (`lib/large-uploads`,
  feedback screenshots), OAuth (`app/api/auth/google/**`, `lib/google-signin`).
- **Auth cores**: `lib/account-auth.ts`, `lib/staff-auth.ts`, `lib/staff-roles.ts`,
  `lib/staff-admin.ts`, `lib/buyer-session.ts`, `lib/guest-order-recovery.ts`.
- **Dev-only / usually ignore**: `scripts/**` (operator CLIs; `staff-create.ts`
  prints a one-time password to stdout — local operator use only, not prod-
  reachable), `tests/**`, `drizzle/seed/**`, `.dev.vars.example`.
- **Known scanner false positives**: SAST `tainted-redirect-express` across
  `route.ts` — redirects build on `new URL(x, request.url)` (same origin) or
  validated enums / `safeAccountReturnPath`; not exploitable open redirects.

## Threat Categories

### Spoofing / Authentication
Customer and staff auth use PBKDF2 hashes, hashed session tokens in HttpOnly
Secure SameSite=Lax cookies, atomic lockout, and generic failure responses.
Email verification tokens are single-use, hashed, 24h TTL. Guest order recovery
uses a 64-hex high-entropy token bound to the specific order + a one-order
session cookie. Google OAuth verifies state/nonce/issuer/audience/expiry.
Guarantee: every protected route must resolve a trusted principal before acting.

### Tampering
Cart/order totals must be recomputed server-side from catalog state; accepted
checkout quotes are bound to account/cart/address/expiry. Refunds require a
positive amount, `refund_due` state, remaining-balance and atomic race guards,
and are capped to charged totals. Guarantee: never trust client-supplied prices,
quantities, totals, or refund amounts.

### Information Disclosure
Order/document reads must be scoped to the owning account (or valid guest
recovery). Public lot endpoints expose only released analytical records. Reports/
CSV exports are staff-authenticated, sensitive-report-gated, purpose-gated,
`private, no-store`, and CSV-formula guarded. Secrets stay server-side.

### Elevation of Privilege
`/manage` requires the correct capability per action; staff mutations are
admin-gated with role allowlisting and last-admin/self protections. Update
handlers assign only explicit validated fields (no mass assignment of
role/status/ownerId). Guarantee: function-level authorization on every staff
action; object-level ownership on every customer object.

### Denial of Service
Auth and public endpoints use rate limiting (`lib/rate-limit`,
`lib/sign-in-throttle`) and Turnstile on abuse-prone flows. Uploads are size/type
constrained (`lib/large-uploads`).

## Current Assessment (Task #68, full scan)

Full scan across all four surfaces (customer IDOR, staff/manage authz,
payments/refunds, public/SSRF/uploads) plus targeted verification found **no
confirmed production-reachable vulnerabilities**. The codebase shows consistent,
defense-in-depth security engineering.
