# DNS take-back: moving nexphaselabs.net onto our own Cloudflare zone

Written 14 September 2026. Supersedes the record set in `DNS-ZONE-nexphaselabs.net.md`.

> ## Completed — verified live 16 September 2026
>
> **This plan has been carried out. Do not re-run it.** The zone is authoritative on
> `cesar`/`marlowe.ns.cloudflare.com`, and `npm run dns:verify` reports every required
> record present:
>
> | | Live, 16 Sep |
> |---|---|
> | MX | `1 smtp.google.com` |
> | SPF | `v=spf1 include:_spf.google.com ~all` |
> | DKIM | `google._domainkey` published, 2048-bit |
> | DMARC | `v=DMARC1; p=none; rua=mailto:dmarc@nexphaselabs.net; fo=1` |
> | Brevo DKIM | `brevo1`/`brevo2._domainkey` still resolve |
>
> Two statements below are therefore historical, not current:
>
> 1. **"There is no SPF, no DKIM and no DMARC anywhere"** (§ *What is actually live
>    today*) described the zone on 14 September. All three exist now.
> 2. **The SPF value in Step 3 is wrong and must not be published.** It reads
>    `include:_spf.google.com include:spf.brevo.com ~all`. The value actually in DNS —
>    and the correct one — omits Brevo. `GO_LIVE_RUNBOOK.md:42-46` gives the reasoning:
>    the two Brevo DKIM CNAMEs let the WordPress store's mail pass DMARC on the DKIM
>    leg, so SPF does not need to authorise Brevo. `nexphaselabs-zone-import.txt` is
>    the canonical record set.
>
> Still open from this document: Namecheap 2FA (risk R-04, § *Risks*) is still off, and
> `dmarc@nexphaselabs.net` has not been confirmed to receive mail.

## The problem in one paragraph

The domain's live nameservers are `addyson.ns.cloudflare.com` / `zac.ns.cloudflare.com`.
That zone is in a Cloudflare account we cannot sign into. The zone in our own account
(`3d429c7b2020e96fe10a1588f1fb3662`, zone id `b2ac9052c87c6b2e8dab7285337702c2`) is
**pending** and assigned `cesar` / `marlowe`. Ammre owns the Namecheap registration, so the
fix is to make our zone correct first and then repoint the nameservers at the registrar.

## What is actually live today (verified 14 Sep against 108.162.194.68, the authoritative NS)

Only four things exist. Everything else tested `NXDOMAIN` — including `mail`, `cpanel`,
`webmail`, `webdisk`, `ftp`, `_dmarc`, and every `_domainkey` selector.

| Record | Value |
| --- | --- |
| A `@` | Cloudflare-proxied (172.67.161.220 / 104.21.42.122), origin still 162.254.39.126 |
| A `www` | same proxied pair |
| MX `@` | `1 smtp.google.com` |
| TXT `@` | `google-site-verification=59nUDSljV-miSpQWE0GIrBiRVRKtAIO1N0-0lhVh5So` |

Origin confirmed: `curl -k -H "Host: nexphaselabs.net" https://162.254.39.126/` returns 200
and the WordPress title. There is **no SPF, no DKIM and no DMARC** anywhere.

## Step 1 — delete these 14 stale records from our pending zone

They were imported from the old Namecheap cPanel setup. None of them exist in the live zone.
The two PrivateEmail MX records are the dangerous ones: if this zone went authoritative
as-is, Google Workspace mail would stop.

```
A      cpanel          162.254.39.126
A      cpcalendars     162.254.39.126
A      cpcontacts      162.254.39.126
A      ftp             162.254.39.126
A      webdisk         162.254.39.126
A      webmail         162.254.39.126
A      whm             162.254.39.126
CNAME  mail            nexphaselabs.net
MX     @               mx1.privateemail.com   (priority 10)
MX     @               mx2.privateemail.com   (priority 10)
TXT    default._domainkey   "v=DKIM1; k=rsa; p=MIIBIjANBgkqhkiG9w0..."   (orphaned key)
TXT    _dmarc          "v=DMARC1; p=none; rua=mailto:rua@dmarc.brevo.com"
TXT    @               "brevo-code:245e2cc6e7e2875a79f141b182bfb476"
TXT    @               "v=spf1 include:spf.privateemail.com"
```

## Step 2 — keep these 4 exactly as they are

```
A      @               162.254.39.126
CNAME  www             nexphaselabs.net
CNAME  brevo1._domainkey   b1.nexphaselabs-net.dkim.brevo.com
CNAME  brevo2._domainkey   b2.nexphaselabs-net.dkim.brevo.com
```

The two Brevo DKIM records are kept deliberately. WordPress still sends its mail through
Brevo until cutover, and publishing them makes that mail better authenticated than it is
today. Drop them once WordPress goes dark.

## Step 3 — add these 4

```
MX     @        smtp.google.com                 priority 1
TXT    @        google-site-verification=59nUDSljV-miSpQWE0GIrBiRVRKtAIO1N0-0lhVh5So
TXT    @        v=spf1 include:_spf.google.com ~all     <- corrected 16 Sep; do NOT add spf.brevo.com
TXT    _dmarc   v=DMARC1; p=none; rua=mailto:dmarc@nexphaselabs.net; fo=1
```

## Step 4 — set A `@` and CNAME `www` to Proxied

The live zone proxies both. Matching it keeps the switch invisible, and a Workers custom
domain needs the zone proxied later anyway.

## Step 5 — DKIM, which cannot be copied

Google Workspace admin console: **Apps → Google Workspace → Gmail → Authenticate email**.
Generate a 2048-bit key, publish the resulting `google._domainkey` TXT in our zone, wait for
it to resolve, then turn signing on. Needs a Workspace super admin.

## Step 6 — the switch

Only after steps 1-4 are done and verified. Namecheap → Domain List → nexphaselabs.net →
Nameservers → Custom DNS:

```
cesar.ns.cloudflare.com
marlowe.ns.cloudflare.com
```

Because our zone will answer identically to the live one, visitors and mail see no change
while the `.net` delegation propagates. Verify with:

```bash
node scripts/dns-verify.mjs
```

## Step 7 — lower the apex TTL

Once our zone is authoritative, set the apex record TTL to 300 at least 24 hours before the
application cutover, so a rollback propagates in five minutes. Put it back a week after.

## Still open

- Registrar 2FA is OFF on the Namecheap account holding the domain (R-04).
- We never identified who controls the `addyson` / `zac` zone. Worth knowing before renewal.
