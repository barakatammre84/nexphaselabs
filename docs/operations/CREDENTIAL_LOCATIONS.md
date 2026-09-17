# Where every credential lives

Status: working record. The controlled copy is MAN-002 §"Where the credentials live"; regenerate it
(`python3 scripts/build-operations-manuals.py`) whenever this file changes.

**No value is ever written here.** Not a key, not a password, not a fragment of one, and not in a
case, a manual, an issue, or source. This file records *where* each credential lives and *who can
obtain it*, so that someone other than Ammre can get to what they need in an incident without
anybody having to hand a secret over in a chat message.

Rotation is always: replace it at the provider, then set it again through the command that owns it.
A credential that has been pasted anywhere it should not be is rotated, not "watched".

## Accounts and platforms

| What | Where it lives | Who can obtain it | Used for |
| --- | --- | --- | --- |
| Cloudflare account | Cloudflare dashboard, account `5438a1e4683ea3ea35ddc20ba50ac05a` "8486 Ventures LLC - NexPhase Labs"; owner login `sam@nexphaselabs.net`, each admin with their own 2FA | `sam@` (Super Administrator); second Super Administrator: the `ammre@nexphaselabs.net` login (added 16 Sep 2026) | Workers, D1, R2, DNS, logs |
| Cloudflare Turnstile keys | Cloudflare dashboard → Turnstile → widget for `nexphaselabs.net`. Site key is public (`TURNSTILE_SITE_KEY` in `wrangler.jsonc`); the secret goes in with `npx wrangler secret put TURNSTILE_SECRET_KEY` and is never pasted anywhere else | Cloudflare Super Administrators | Sign-up bot check (lib/turnstile.ts) |
| Brevo (product news) | app.brevo.com, the `sam@nexphaselabs.net` account. API key → `npx wrangler secret put BREVO_API_KEY`; webhook token (a random string of your own) → `BREVO_WEBHOOK_TOKEN` and the same value in the Brevo webhook URL `?token=`; list id and sender are vars in `wrangler.jsonc` | Business & Systems lead | Product-news list and sender (lib/brevo.ts); never transactional mail |
| Partner W-9 forms | The company vault, never this application. `/manage/affiliates` records only a locator; the route refuses anything shaped like a taxpayer identification number | Business & Systems lead | Contractor reporting for affiliate payouts |
| Google sign-in OAuth client | Google Cloud console, project `nexphaselabs`, a **second** client with an External consent screen (not the Gmail sending client). Client id is a var; secret via `npx wrangler secret put GOOGLE_SIGN_IN_CLIENT_SECRET` | `sam@nexphaselabs.net` as project owner | "Continue with Google" on customer sign-in (lib/google-signin.ts) |
| GitHub repository | github.com, per-person account | Business & Systems lead | Source, Actions, deploy workflows |
| Google Workspace | admin.google.com | Business & Systems lead | Mail, Drive, staff identities |
| Domain registrar | Registrar account | Business & Systems lead | `nexphaselabs.net`, the cutover |
| Shippo | goshippo.com dashboard | Business & Systems lead | Carrier accounts, rates, labels |
| Payment provider | Provider dashboard | Business & Systems lead, with the banking owner's approval | Checkout, refunds, settlement |

## Deploy and recovery credentials

| Name | Where it lives | Who can obtain it | Used by |
| --- | --- | --- | --- |
| `CLOUDFLARE_API_TOKEN` | GitHub repository secret; the operator's shell for manual runs | Business & Systems lead, created in the Cloudflare dashboard | `deploy-staging.yml`, `deploy-production.yml`, D1 export |
| `CLOUDFLARE_ACCOUNT_ID` | GitHub repository secret; also in `wrangler.jsonc` (not a secret) | Anyone with repository access | Deploy workflows |
| `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY` | Cloudflare R2 API tokens page; held only for the duration of a rehearsal | Business & Systems lead | `scripts/recovery-rehearsal.mjs` |
| `STAGING_URL` | GitHub repository variable (not a secret) | Anyone with repository access | Staging deploy and smoke tests |

Required token scopes: Account · D1 · Edit, Account · Workers R2 Storage · Edit, Account · Workers
Scripts · Edit. A token missing one of these fails with Cloudflare error **10000**, which means
rejected, not missing — see MAN-002.

## Worker secrets

Set per environment and never readable afterwards:

```bash
npx wrangler secret put <NAME>                 # production
npx wrangler secret put <NAME> --env staging   # staging
npx wrangler secret list --env staging
```

| Secret | Purpose | Environment |
| --- | --- | --- |
| `STAGING_ACCESS_PASSWORD` | Basic-auth password for a closed staging storefront. **Not set:** staging has been public by the owner's decision since 14 September 2026 (`STAGING_ACCESS_OPEN` in `wrangler.jsonc`). Needed only if staging is closed again, and then shared with testers through the approved password manager | staging, closed mode only (a closed staging without it refuses every request) |
| `SHIPPO_API_KEY` | Rates, labels, tracking | both |
| `SHIPPO_WEBHOOK_TOKEN` | Secret URL token Shippo presents to the webhook | both |
| `SHIPPO_FROM_JSON`, `SHIPPO_ORIGINS_JSON` | Private ship-from contacts | both |
| `GOOGLE_WORKSPACE_PRIVATE_KEY` | Service-account key for Gmail API sending | both |
| `GOOGLE_WORKSPACE_OAUTH_CLIENT_SECRET`, `GOOGLE_WORKSPACE_OAUTH_REFRESH_TOKEN` | OAuth alternative to the service-account key | both |
| `RESEND_API_KEY` | Alternative mail provider | both |
| `PAYMENT_BANK_INSTRUCTIONS` | Bank remittance text shown to a customer | production |
| `ZELLE_GMAIL_OAUTH_CLIENT_SECRET`, `ZELLE_GMAIL_OAUTH_REFRESH_TOKEN` | Dedicated read-only Gmail authorization for Chase Zelle receipts | production |
| `BTCPAY_API_KEY`, `BTCPAY_WEBHOOK_SECRET` | Bitcoin checkout and settlement | production |
| `DIGEST_TOKEN` | Bearer token an external scheduler presents to `/api/digest` | both |
| `CHATGPT_FEEDBACK_READ_TOKEN` | Read-only feedback archive API | both |
| `TAXJAR_API_KEY` | Tax calculation, when the provider is enabled | both |

Everything else in `db/env.d.ts` is a non-secret variable and lives in `wrangler.jsonc`
(`APP_ENV`, `PUBLIC_ORIGIN`, feature switches, shipping and tax configuration, sender addresses).
`STAGING_ACCESS_OPEN` is one of those switches, not a credential: it is declared in `wrangler.jsonc` so
the staging deploy can read it, and must never be set as a Worker secret.
`.dev.vars` holds local development values only and is git-ignored; it is not a place to keep a
production credential.

## Single point of failure

Today only one person can obtain any of the above. That is recorded in the release engineering
register as `c16-fallback` and is not closed by this document. Until a named second person has their
own Cloudflare and GitHub access, one unavailable person is one unavailable platform.

When a fallback is agreed, add them here with the date, and give them their own account — never a
shared login.

16 September 2026: the Cloudflare estate moved into the company account. `sam@nexphaselabs.net`
owns it; the `ammre@nexphaselabs.net` login is the second Super Administrator (an alias on the
`sam@` mailbox, with its own Cloudflare password and authenticator). `ammre@bistelligent.com` was
a Super Administrator for the migration week only. GitHub and the registrar are still single-login
and remain on `c16-fallback`.
