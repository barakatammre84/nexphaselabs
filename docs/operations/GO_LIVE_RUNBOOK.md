# Go live on nexphaselabs.net — the whole sequence

Written 14 September 2026. This replaces the scattered DNS and email notes. Work it top to
bottom. Nothing here is reversible-by-accident: every step that changes what the public sees
is called out, and the rollback is one DNS record until the WordPress host is cancelled.

Owner of every step below is Ammre unless named otherwise.

---

## Part 1 — Take the zone back (nothing public changes)

The live nameservers are `addyson` / `zac`, in a Cloudflare account we cannot sign into (resolved
16 September: that account is `sam@nexphaselabs.net`'s — now the company account, see
`docs/DEPLOY.md`). Our
own zone is pending on `cesar` / `marlowe`. Steps 1.1 to 1.4 all happen inside our pending
zone, which is **not authoritative**, so they have no effect on visitors or mail. They are
safe to do in any order, at any time.

### 1.1 Delete the 14 stale records

Imported from the old Namecheap cPanel setup; none exist in the live zone. The two
PrivateEmail MX records are the dangerous ones — they would take Google Workspace mail down
the moment this zone went live.

```
A      cpanel / cpcalendars / cpcontacts / ftp / webdisk / webmail / whm   162.254.39.126
CNAME  mail                  nexphaselabs.net
MX     @                     mx1.privateemail.com   (10)
MX     @                     mx2.privateemail.com   (10)
TXT    default._domainkey    orphaned RSA key
TXT    _dmarc                v=DMARC1; p=none; rua=mailto:rua@dmarc.brevo.com
TXT    @                     brevo-code:245e2cc6e7e2875a79f141b182bfb476
TXT    @                     v=spf1 include:spf.privateemail.com
```

### 1.2 Keep these four untouched

```
A      @                     162.254.39.126
CNAME  www                   nexphaselabs.net
CNAME  brevo1._domainkey     b1.nexphaselabs-net.dkim.brevo.com
CNAME  brevo2._domainkey     b2.nexphaselabs-net.dkim.brevo.com
```

The Brevo DKIM records stay on purpose. WordPress still sends through Brevo until cutover,
and with these published its mail passes DMARC on the DKIM leg — which is why the SPF record
below does **not** need to authorise Brevo. Delete these two once WordPress goes dark.

### 1.3 Import the four new records

`DNS > Records > Import` and upload `docs/operations/nexphaselabs-zone-import.txt`:

```
MX     @        1 smtp.google.com
TXT    @        google-site-verification=59nUDSljV-miSpQWE0GIrBiRVRKtAIO1N0-0lhVh5So
TXT    @        v=spf1 include:_spf.google.com ~all
TXT    _dmarc   v=DMARC1; p=none; rua=mailto:dmarc@nexphaselabs.net; fo=1
```

### 1.4 Set apex `A` and `www` to Proxied

The live zone proxies both. Matching it keeps the switch invisible, and the Workers custom
domain in Part 3 needs a proxied zone anyway.

### 1.5 Create the `dmarc@` address — do not skip

`rua=mailto:dmarc@nexphaselabs.net` only works if that address receives mail. In Google
Workspace admin, add `dmarc@nexphaselabs.net` as a group or as an alias on a real mailbox.
Without it the reports bounce and DMARC monitoring is theatre.

### 1.6 Generate Google DKIM — the one record that cannot be copied

Google Workspace admin → **Apps → Google Workspace → Gmail → Authenticate email**. Generate a
2048-bit key for nexphaselabs.net. It produces a `google._domainkey` TXT value unique to the
tenant. Publish it in our zone, wait until it resolves, **then** click Start Authentication.
Needs a Workspace super admin.

---

## Part 2 — The nameserver switch (the first real change)

Only after 1.1 to 1.4 are done and verified. Namecheap → Domain List → nexphaselabs.net →
Nameservers → Custom DNS:

```
cesar.ns.cloudflare.com
marlowe.ns.cloudflare.com
```

Because our zone now answers identically to the live one, visitors and mail see nothing
change while the `.net` delegation propagates. Registry NS records can be cached up to 48
hours, so both zones may answer during the window — which is exactly why they must match
before you switch, not after.

Verify: `node scripts/dns-verify.mjs`

**Also turn on 2FA on the Namecheap account** while you are in there. It is off, and it holds
a company asset in a personal account (R-04).

---

## Part 3 — Production readiness (independent of DNS; can run in parallel)

Production is healthy at `https://nexphaselabs.nexphase.workers.dev` — database and document
store both report OK, running the reviewed build. Its catalog correctly shows **zero
products**, because production has no released lots. To sell GHK-Cu these must land:

| # | Thing | Why it blocks a sale |
| --- | --- | --- |
| 3.1 | `RESEARCHER_TIER_ENABLED=true` in production vars | currently `false`; researcher pricing never appears |
| 3.2 | `OPEN_CHECKOUT_ENABLED=true` in production vars | not set at all; guest checkout is off |
| 3.3 | `TAX_PROVIDER=cdtfa` in production vars | BUILT 15 Sep, commit 835f7e0. Uses California's free public rate API — no TaxJar, no subscription. Needs only a California business origin address, which is already known. Open: ask the accountant whether to charge each customer's full district rate (shipped default) or only the 7.25% base for districts you are not engaged in business in (`CDTFA_DISTRICT_RATE=statewide`). |
| 3.4 | GHK-Cu product + variant published with a real price | `NPL-004-50MG`, $29.00 |
| 3.5 | GHK-Cu lot entered and **released** in production | `GHKCU50-2605-01`, container 50 mg, ILS Laboratories, COA-2026-ZKMVY2, purity 99.80%. Needs the manufacturer's full name and address — the release blockers refuse without it. |
| 3.6 | COA PDF uploaded to the production R2 bucket | staging has it; `nexphase-documents` does not |
| 3.7 | Live Shippo key | test key cannot buy a real label |
| 3.3b | `POLICIES_COUNSEL_REVIEWED=true` in production vars | counsel review is COMPLETE (Ammre, 14 Sep). Until this is set, all six legal pages render a DRAFT banner to customers. |
| 3.8 | Zelle: Gmail read-only receipt credentials, official Chase QR | Recipient name CONFIRMED by the owner 15 Sep and corrected to `8486 Ventures LLC`. Chase still uses the legal name, not the DBA; when that changes it is a one-value config edit. |

Release of a lot is a named, recorded act. Do it yourself in `/manage`; do not let it be
simulated.

---

## Part 4 — Cutover

1. Back up production D1: `npm run ops:backup:production`
2. Release a reviewed `v*` tag; the workflow applies migrations and deploys.
3. Smoke-test the Worker origin before any domain change.
4. Attach `nexphaselabs.net` to the production Worker as a Workers custom domain.
5. **Leave the WordPress host running and unchanged.** It is the rollback.
6. Run `npx tsx scripts/cutover-verify.ts https://nexphaselabs.net` from two networks.
7. Fetch the old URLs: `/shop/`, `/product/bpc-157/`, `/privacy-policy/`.
8. Send and reply from each mailbox to an outside address.
9. Watch `npx wrangler tail` for 1102 resource-limit errors.

Rollback thresholds are in `CUTOVER_ROLLBACK_TRIGGERS.md`. The fallback operator line is
still blank — fill it before cutover day.

---

## What is still genuinely unresolved

- **Workers plan.** The 11 Sep 1102 errors were never explained. Confirm whether this account
  is on Workers Paid; the free plan's CPU ceiling is the leading theory and it would hit
  production the same way.
- ~~**Nobody owns the `addyson`/`zac` zone** as far as we know.~~ Resolved 16 September: it is
  the `sam@nexphaselabs.net` Cloudflare account, `5438a1e4683ea3ea35ddc20ba50ac05a`, now the
  company account.
- **No named fallback operator**, and the GitHub plan will not enforce a second reviewer on
  production releases. You are currently the only person who can deploy or roll back.
