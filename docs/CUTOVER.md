# Cutover plan: nexphaselabs.net

Written 2026-09-03 and updated 2026-09-15. Staging and the production Worker
origin are deployed, but the public domain still serves the existing WordPress
store. Do not attach the custom domain until every gate below is complete.

## Go-live decisions, 15 September 2026

Recorded from the owner on 15 September 2026:

- **Friday 18 September goes live catalog-only.** The domain moves to the Worker with the catalog,
  lot records and account sign-up, and no orders are taken yet. Production keeps checkout closed
  (`OPEN_CHECKOUT_ENABLED` unset), and orders stay refused until shipping and tax quoting work.
  Until then the cart tells buyers that online ordering is not open yet, and `/manage/readiness`
  lists the settings that are still missing.
- **Ordering waits for the ship-from PO Box**, which arrives Saturday 19 September. Live shipping,
  its origin and the tracking webhook are configured after that. Guest checkout in production has
  not been decided.
- **The legal entity is 8486 Ventures LLC, doing business as Nexphaselabs.** The brand is written
  NexPhase Labs on the site. Chase Zelle pays the legal name, not the DBA.
- **Counsel has signed off every legal page**, so `POLICIES_COUNSEL_REVIEWED=true` is set for
  production and staging in `wrangler.jsonc`.

## What is live today

| Thing | State |
| --- | --- |
| nexphaselabs.net | WordPress + SureCart storefront, proxied through Cloudflare (origin recorded on 3 September as LiteSpeed at 162.254.39.126) |
| Pages | `/shop`, `/cart`, `/checkout`, `/my-account`, `/customer-dashboard`, `/faq`, `/about`, `/disclaimer`, `/privacy-policy`, `/shipping-policy` |
| Registrar | Namecheap, expires 2027-02-27 |
| Authoritative DNS | Cloudflare (`cesar.ns.cloudflare.com`, `marlowe.ns.cloudflare.com`), the zone in account `3d429c7b2020e96fe10a1588f1fb3662` |
| Mail | Google Workspace, `MX 1 smtp.google.com`, users sam@, mel@, tima@ |
| Cloudflare zone | Active in account `3d429c7b2020e96fe10a1588f1fb3662`. Public answers on 15 September 2026: apex and `www` proxied, `MX 1 smtp.google.com` only, and SPF, DMARC and Google DKIM published. No PrivateEmail MX record answers. |
| New application | Staging and production Workers are deployed in account `3d429c7b2020e96fe10a1588f1fb3662`; no custom domain points at the new application. |

The new application and the live store are entirely separate systems. They
share only a domain name. No data moves between them; the WordPress orders,
customers and products are not imported anywhere.

## Mail authentication

Checked against public DNS on 15 September 2026. The zone publishes:

```
TXT  @                  v=spf1 include:_spf.google.com ~all
TXT  _dmarc             v=DMARC1; p=none; rua=mailto:dmarc@nexphaselabs.net; fo=1
TXT  google._domainkey  v=DKIM1; k=rsa; p=<the tenant's 2048-bit Google key>
```

Still to do:

- **Confirm Google is signing.** A published DKIM record does not prove signing
  is on. Check Apps, Google Workspace, Gmail, Authenticate email in the Google
  Admin console, or send a message to an outside mailbox and look for
  `d=nexphaselabs.net` in its `DKIM-Signature` header.
- **Make sure `dmarc@nexphaselabs.net` exists** as a mailbox, alias or group,
  or the DMARC reports are lost.
- **Leave DMARC at `p=none` for two weeks** and read the reports before moving
  to `p=quarantine`. Moving straight to enforcement with no SPF history is how
  companies lose their own mail.

## Order of operations for the cutover

Steps 1 through 5 do not change what the public domain serves. Step 6 is the
customer-facing switch and uses the retained WordPress host for rollback.

1. **Deploy and exercise staging.** The new site runs at its workers.dev
   origin with its own database and documents. No DNS involved. Everything in
   `docs/PROGRESS.md` that is marked verified locally gets re-verified against
   real infrastructure: sign-in, an organisation approval, an order, a
   shipment, a document download, a real email.
2. **Confirm the active Cloudflare zone.** Done: the nameservers are `cesar` /
   `marlowe`, the zone in account `3d429c7b2020e96fe10a1588f1fb3662`. Its public
   answers keep the Google MX and site-verification TXT and carry no
   PrivateEmail MX.
3. **Add and prove mail authentication.** SPF, monitoring-mode DMARC and the
   Google DKIM record are published. Confirming that Google signs, and proving
   delivery and replies with an external mailbox, are still open (see "Mail
   authentication" above).
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
   DNS record. Leave `www` off the Worker, which has no `www` redirect of its
   own; today WordPress sends `www` to the apex with a 301. Add a Cloudflare
   redirect rule first that sends `www.nexphaselabs.net` to
   `https://nexphaselabs.net` with the path and query kept (301), so `www`
   stops depending on the WordPress host.
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
