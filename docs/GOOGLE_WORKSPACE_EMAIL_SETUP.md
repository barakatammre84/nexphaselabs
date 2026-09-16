# Google Workspace transactional email setup

Status: Gmail API support, internal OAuth authorization, protected staging secrets, verified `research@nexphaselabs.net` Send-as identity, provider acceptance, and inbox delivery are proven in staging. Production authorization, broader workflow rehearsal, and delivery-event monitoring remain separate launch controls.

## Chosen design

The Worker sends transactional messages through the Gmail API over HTTPS. The preferred configuration authorizes one Workspace mailbox with internal OAuth and offline access using only the `gmail.send` scope. The client secret and refresh token are Cloudflare secrets; they are never stored in the repository, Drive, an SOP, or chat. A delegated service account remains supported for organizations whose security policy permits service-account keys.

Default sender: `NexPhase Labs <research@nexphaselabs.net>`. On 9 September 2026, `research@nexphaselabs.net` was created as an alternate address for the licensed `sam@nexphaselabs.net` Workspace user. Delegate Gmail API access to `sam@nexphaselabs.net`; Gmail may then use the approved `research@` alias as the From identity. A Group address alone cannot be impersonated as a user.

## Google administrator steps — internal OAuth

1. In the company-controlled `Nexphaselabs` Google Cloud project, enable **Gmail API**.
2. Configure **Google Auth Platform** as an internal application named **NexPhase Transactional Mail** with `sam@nexphaselabs.net` as the support and notification contact.
3. Add exactly this data-access scope:

   `https://www.googleapis.com/auth/gmail.send`

4. Create one OAuth client for the controlled authorization flow and obtain offline consent from `sam@nexphaselabs.net`. Store the client secret and returned refresh token immediately in staging secrets.
5. Confirm the sender can send a normal message from the `research@nexphaselabs.net` alias.
6. Configure DKIM for `nexphaselabs.net`, confirm the domain SPF record authorizes Google Workspace, and publish DMARC at least in monitoring mode. Keep the From domain aligned with SPF or DKIM.

On 9 September 2026, Google blocked service-account key creation through the inherited `iam.managed.disableServiceAccountKeyCreation` policy, and the current account could not override it. The policy was not weakened. A no-role service account was created before this restriction was surfaced, but no private key exists and it is not used by the application.

On the same date, the internal OAuth application and web client were created, `sam@nexphaselabs.net` granted only `gmail.send`, and offline authorization was stored directly as protected staging secrets. A token refresh returned HTTP 200 with exactly the Gmail send scope. This proves authorization, not inbox delivery. Production secrets were not changed.

## Obtaining the refresh token — `npm run mail:consent`

Added 16 September 2026. `scripts/google-mail-consent.mjs` is step 4 of the
administrator list above, done without the token ever touching a chat, a
document or a shell history line. It opens the consent screen for the internal
client, receives the code on `http://127.0.0.1:8788/callback`, exchanges it, and
**proves** the result the way the Worker will use it: a refresh must return an
access token carrying exactly `gmail.send`.

```bash
npm run mail:consent -- --put --env production   # pipes straight into wrangler secret put
npm run mail:consent -- --put --env staging
npm run mail:consent                              # or: print the token once, paste it yourself
```

It prompts for the client id and (hidden) client secret, or reads
`GOOGLE_WORKSPACE_OAUTH_CLIENT_ID` / `_CLIENT_SECRET` from the environment.
Complete the consent as the sending mailbox (`sam@nexphaselabs.net`). Each run
mints a new refresh token and earlier ones keep working, so production and
staging hold different tokens by design. One-time prerequisite for the web
client: add `http://127.0.0.1:8788/callback` under **Authorized redirect URIs**
(a `redirect_uri_mismatch` error means it is missing). After the token, set
`GOOGLE_WORKSPACE_OAUTH_CLIENT_ID`, `GOOGLE_WORKSPACE_OAUTH_CLIENT_SECRET` and
`GOOGLE_WORKSPACE_SENDER` with `wrangler secret put` as listed below.

## Cloudflare secrets and settings

Set these separately in staging and production. Start with staging only.

```text
EMAIL_PROVIDER=google_workspace
GOOGLE_WORKSPACE_OAUTH_CLIENT_ID=<internal OAuth client ID>
GOOGLE_WORKSPACE_OAUTH_CLIENT_SECRET=<OAuth client secret>
GOOGLE_WORKSPACE_OAUTH_REFRESH_TOKEN=<offline refresh token>
GOOGLE_WORKSPACE_SENDER=sam@nexphaselabs.net
EMAIL_FROM=NexPhase Labs <research@nexphaselabs.net>
TEST_EMAIL_ALLOWLIST=<exact approved staging inboxes, comma separated>
```

Use `wrangler secret put` for the OAuth client secret and refresh token. Keeping all OAuth values in protected deployment settings is acceptable. Never copy a production credential to staging.

## Staging acceptance test

Current safety state: `TEST_EMAIL_ALLOWLIST` contains only `sam@nexphaselabs.net`. The twelve historical synthetic notices are already in `Needs attention` for non-allowlisted example addresses; none is pending and activating the provider cannot release them automatically.

On 9 September 2026, staging queued exactly one initial controlled notice, Gmail accepted it on the first attempt, and it arrived once in the allowlisted inbox. The application recorded the provider ID and no retry or error. The message was marked `[TEST]`, used the staging URL, and showed `mailed-by: nexphaselabs.net`, but Gmail initially displayed `sam@nexphaselabs.net` in the From field. `Research Team <research@nexphaselabs.net>` was then added under Gmail **Settings → Accounts → Send mail as** with **Treat as an alias** selected. Its first confirmation bounced while the newly created Workspace alias was propagating. After the receiving alias became active, the confirmation link was completed and Gmail no longer displayed `unverified`. A second and final controlled staging notice was accepted on its first attempt, arrived once, and displayed **NexPhase Labs** as the sender. No other pending notice was released.

1. Allowlist only the mailbox(es) participating in the test.
2. Deploy staging and use a synthetic account to request email verification.
3. Confirm the app records a Gmail provider message ID. This proves API acceptance, not inbox delivery.
4. Confirm the test-tagged message arrives in the inbox, the From identity is correct, and its verification link points to staging.
5. Inspect the received headers and confirm SPF, DKIM, and DMARC pass.
6. Exercise one order update and the operations digest. Confirm each message arrives once.
7. Cause one controlled invalid-recipient or authorization failure and confirm it appears in **Internal → Notifications** without false success.
8. Attach screenshots/message headers to the email readiness control; never attach the private key or access token.

For Gmail, an uncertain send timeout is not retried automatically because the message might already be in Sent mail. A staff member must reconcile the deterministic Message-ID against Sent mail before manually resolving or resending.

Official references: [Gmail API sending guide](https://developers.google.com/workspace/gmail/api/guides/sending), [web-server OAuth and offline access](https://developers.google.com/identity/protocols/oauth2/web-server), [Gmail server-side authorization](https://developers.google.com/workspace/gmail/api/auth/web-server), [Gmail sender requirements](https://support.google.com/mail/answer/81126), and [Google Workspace SMTP options](https://support.google.com/a/answer/176600).
