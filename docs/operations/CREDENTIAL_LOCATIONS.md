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
| Cloudflare account | Cloudflare dashboard, owner's login with their own 2FA | Business & Systems lead | Workers, D1, R2, DNS, logs |
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
| `SHIPPO_API_KEY` | Rates, labels, tracking | both |
| `SHIPPO_WEBHOOK_TOKEN` | Secret URL token Shippo presents to the webhook | both |
| `SHIPPO_FROM_JSON`, `SHIPPO_ORIGINS_JSON` | Private ship-from contacts | both |
| `GOOGLE_WORKSPACE_PRIVATE_KEY` | Service-account key for Gmail API sending | both |
| `GOOGLE_WORKSPACE_OAUTH_CLIENT_SECRET`, `GOOGLE_WORKSPACE_OAUTH_REFRESH_TOKEN` | OAuth alternative to the service-account key | both |
| `RESEND_API_KEY` | Alternative mail provider | both |
| `PAYMENT_BANK_INSTRUCTIONS` | Bank remittance text shown to a customer | production |
| `ZELLE_GMAIL_OAUTH_CLIENT_SECRET`, `ZELLE_GMAIL_OAUTH_REFRESH_TOKEN` | Dedicated read-only Gmail authorization for Chase Zelle receipts | production |

Public staging access was approved on 14 September 2026. `STAGING_ACCESS_PASSWORD` is retired; public
responses remain unindexable, while staff pages and private APIs use application authentication.
| `BTCPAY_API_KEY`, `BTCPAY_WEBHOOK_SECRET` | Bitcoin checkout and settlement | production |
| `DIGEST_TOKEN` | Bearer token an external scheduler presents to `/api/digest` | both |
| `CHATGPT_FEEDBACK_READ_TOKEN` | Read-only feedback archive API | both |
| `TAXJAR_API_KEY` | Tax calculation, when the provider is enabled | both |

Everything else in `db/env.d.ts` is a non-secret variable and lives in `wrangler.jsonc`
(`APP_ENV`, `PUBLIC_ORIGIN`, feature switches, shipping and tax configuration, sender addresses).
`.dev.vars` holds local development values only and is git-ignored; it is not a place to keep a
production credential.

## Single point of failure

Today only one person can obtain any of the above. That is recorded in the release engineering
register as `c16-fallback` and is not closed by this document. Until a named second person has their
own Cloudflare and GitHub access, one unavailable person is one unavailable platform.

When a fallback is agreed, add them here with the date, and give them their own account — never a
shared login.
