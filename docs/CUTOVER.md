# Cutover plan: nexphaselabs.net

Written 2026-09-03 and updated 2026-09-14. Staging and the production Worker
origin are deployed, but the public domain still serves the existing WordPress
store. Do not attach the custom domain until every gate below is complete.

## What is live today

| Thing | State |
| --- | --- |
| nexphaselabs.net | WordPress + SureCart storefront on LiteSpeed at 162.254.39.126 |
| Pages | `/shop`, `/cart`, `/checkout`, `/my-account`, `/customer-dashboard`, `/faq`, `/about`, `/disclaimer`, `/privacy-policy`, `/shipping-policy` |
| Registrar | Namecheap, expires 2027-02-27 |
| Authoritative DNS | Cloudflare (`addyson.ns.cloudflare.com`, `zac.ns.cloudflare.com`) |
| Mail | Google Workspace, `MX 1 smtp.google.com`, users sam@, mel@, tima@ |
| Cloudflare zone | The public zone uses `addyson` / `zac`. The zone visible in account `3d429c7b2020e96fe10a1588f1fb3662` is pending, assigns `cesar` / `marlowe`, and contains stale imported PrivateEmail MX records. It is a different zone; do not activate it as-is. |
| New application | Staging and production Workers are deployed in account `3d429c7b2020e96fe10a1588f1fb3662`; no custom domain points at the new application. |

The new application and the live store are entirely separate systems. They
share only a domain name. No data moves between them; the WordPress orders,
customers and products are not imported anywhere.

## Fix first, independent of any cutover

The domain has **no SPF, no DKIM and no DMARC record**. Only a Google
site-verification TXT is present.

Two consequences today, before anything changes:

- Mail from sam@, mel@ and tima@ has no sender authentication, so receiving
  institutions are more likely to filter it. A verification email or an order
  confirmation that lands in spam looks to the customer like a broken site.
- Anyone can send mail claiming to be from nexphaselabs.net.

Add these only in the active authoritative Cloudflare zone after its existing
records have been exported and reconciled. Preserve the working Google MX and
site-verification records. Do not add them to the pending stale zone and assume
they are live.

```
TXT  @        v=spf1 include:_spf.google.com ~all
TXT  _dmarc   v=DMARC1; p=none; rua=mailto:dmarc@nexphaselabs.net; fo=1
```

DKIM must be generated inside the Google Admin console under Apps, Google
Workspace, Gmail, Authenticate email. It produces a `google._domainkey` TXT
value unique to the tenant, which is then added at Namecheap. Turn DKIM on in
the console only after the record resolves.

Leave DMARC at `p=none` for two weeks and read the reports before moving to
`p=quarantine`. Moving straight to enforcement with no SPF history is how
companies lose their own mail.

## Order of operations for the cutover

Steps 1 through 5 do not change what the public domain serves. Step 6 is the
customer-facing switch and uses the retained WordPress host for rollback.

1. **Deploy and exercise staging.** The new site runs at its workers.dev
   origin with its own database and documents. No DNS involved. Everything in
   `docs/PROGRESS.md` that is marked verified locally gets re-verified against
   real infrastructure: sign-in, an organisation approval, an order, a
   shipment, a document download, a real email.
2. **Locate and export the active Cloudflare zone.** The nameservers have
   already moved to `addyson` / `zac`; the current account's pending zone is
   assigned `cesar` / `marlowe`, so it is not authoritative. Obtain access to
   the account that owns the active pair and compare its records with public
   answers line by line. The Google MX and verification TXT must remain; stale
   PrivateEmail MX records must never become authoritative.
3. **Add and prove mail authentication.** Publish SPF and monitoring-mode DMARC
   in the active zone. Generate the tenant-specific 2048-bit Google DKIM value,
   publish it, enable signing, and prove delivery and replies with an external
   mailbox.
4. **Prepare the rollback.** Export and reconcile WordPress, SureCart, media,
   and a full hosting backup. Agree the rollback thresholds and fallback
   operator. Keep the old host unchanged and set the apex TTL to 300 at least
   24 hours before cutover.
5. **Prove production readiness.** Run a recovery rehearsal, enter and release
   real inventory with its lot documents, configure the approved live services,
   release a reviewed `v*` tag, and smoke-test the Worker origin.
6. **Cut the application over** by attaching the root to the Worker instead of
   the WordPress host, as a Workers custom domain. Keep the WordPress host
   running and unchanged so the previous step can be reversed by editing one
   DNS record.
7. **Decide what happens to the old store.** It has customers, orders and
   payment history in SureCart. That data does not move to the new system, so
   it needs an export and a retention decision before the host is cancelled.

## What breaks at step 6, and what to do about it

- **Every existing URL.** The live store's paths do not exist in the new
  application: `/shop`, `/cart`, `/checkout`, `/my-account`,
  `/customer-dashboard`, `/shop-2`, `/accessibility-statement`. Anything
  indexed by search engines or linked from elsewhere becomes a 404. Decide per
  path: redirect to the closest new page, or return 410 because the thing is
  genuinely gone. `/privacy-policy` and `/shipping-policy` exist in the new
  site under `/legal/`, so those are simple redirects.
- **Existing customers.** WordPress logins and order history do not transfer.
  The new application can accept a guest order, but its browser-based history
  and recovery code are separate from the old account. Customers need to be
  told before the switch, not after.
- **Checkout.** The old store takes payment through SureCart. The new
  application has a manual-review Zelle path, but production checkout remains
  closed while inventory, mail, recovery, and live payment evidence are open.
  Cutting over before those gates close would replace a working checkout with
  an intentionally unavailable one.
- **Search ranking.** The current title is "NexPhase Labs | Research Grade
  Peptides USA". The new site is deliberately not written for that query. A
  ranking drop is the intended consequence of the repositioning, not a defect,
  but it should be a decision rather than a surprise.

## Checkout decision now in force

The new application supports public guest checkout with an age confirmation,
a research-use acknowledgement, server-side pricing, released-lot gating, and
manual Zelle review. Staging exercises that model with synthetic payment and
shipping data. Production remains closed until real inventory and all launch
gates are evidenced; enabling it is part of the reviewed production release,
not a side effect of attaching the domain.
