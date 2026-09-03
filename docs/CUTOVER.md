# Cutover plan: nexphaselabs.net

Written 2026-09-03. Nothing in this document has been executed. The live site
and its DNS are untouched.

## What is live today

| Thing | State |
| --- | --- |
| nexphaselabs.net | WordPress + SureCart storefront on LiteSpeed at 162.254.39.126 |
| Pages | `/shop`, `/cart`, `/checkout`, `/my-account`, `/customer-dashboard`, `/faq`, `/about`, `/disclaimer`, `/privacy-policy`, `/shipping-policy` |
| Registrar | Namecheap, expires 2027-02-27 |
| Authoritative DNS | Namecheap (`dns1.registrar-servers.com`, `dns2.registrar-servers.com`) |
| Mail | Google Workspace, `MX 1 smtp.google.com`, users sam@, mel@, tima@ |
| Cloudflare zone | Exists in the **bistelligent** account, delegation never switched, so inactive |
| New application | Cloudflare Workers, company account `5438a1e4683ea3ea35ddc20ba50ac05a`, not yet deployed |

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

Add these at Namecheap now. They are additive and cannot break the store.

```
TXT  @        v=spf1 include:_spf.google.com ~all
TXT  _dmarc   v=DMARC1; p=none; rua=mailto:sam@nexphaselabs.net; fo=1
```

DKIM must be generated inside the Google Admin console under Apps, Google
Workspace, Gmail, Authenticate email. It produces a `google._domainkey` TXT
value unique to the tenant, which is then added at Namecheap. Turn DKIM on in
the console only after the record resolves.

Leave DMARC at `p=none` for two weeks and read the reports before moving to
`p=quarantine`. Moving straight to enforcement with no SPF history is how
companies lose their own mail.

## Order of operations for the cutover

Each step is reversible until step 5.

1. **Deploy and exercise staging.** The new site runs at its workers.dev
   origin with its own database and documents. No DNS involved. Everything in
   `docs/PROGRESS.md` that is marked verified locally gets re-verified against
   real infrastructure: sign-in, an organisation approval, an order, a
   shipment, a document download, a real email.
2. **Add the mail records above** and confirm with `dig` that they resolve.
3. **Move the zone to the company Cloudflare account.** The existing zone sits
   in the bistelligent account; production now lives in the company account, so
   the zone should be deleted there and re-added under
   `sam@nexphaselabs.net`. Import every existing record, then compare the
   Cloudflare record list against the Namecheap list line by line. The MX
   records and the site-verification TXT are the ones that must not be missed.
4. **Point the root and www at the current WordPress host inside Cloudflare**,
   proxied, and leave the nameservers at Namecheap. Nothing has changed for
   visitors yet; this is only staging the configuration.
5. **Switch the nameservers at Namecheap to the Cloudflare pair.** This is the
   irreversible-feeling step, though it can be switched back. Propagation is
   usually minutes and at most a day. Watch mail delivery for the first hour:
   send a message from each of the three accounts to an outside address and
   back.
6. **Cut the application over** by pointing the root at the worker instead of
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
- **Existing customers.** The new site has no accounts, and by design it will
  not open one without a verified institution. Anyone with a WordPress login
  simply cannot get in. They need to be told before the switch, not after.
- **Checkout.** The old store takes payment through SureCart. The new one has
  no payment rail configured at all. If money is being taken today, cutting
  over stops that until a rail is chosen and connected.
- **Search ranking.** The current title is "NexPhase Labs | Research Grade
  Peptides USA". The new site is deliberately not written for that query. A
  ranking drop is the intended consequence of the repositioning, not a defect,
  but it should be a decision rather than a surprise.

## The thing to settle before any of this

The live store sells to the public with a cart and a checkout. The new
application refuses to show a price to anyone who is not a verified
institution. These are two different businesses on one domain, and
`CLAUDE.md` describes the venture as pre-launch with nothing shipped and no
payment taken, which the live checkout contradicts.

Which one the domain should point at is a business and regulatory decision,
not a deployment step. It is the question the counsel brief in
`docs/strategy/` exists to answer, and it should be answered before step 5.
