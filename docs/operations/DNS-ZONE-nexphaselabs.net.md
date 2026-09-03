# nexphaselabs.net — DNS zone snapshot and migration sheet

Captured 3 September 2026 directly from the authoritative nameservers
(dns1/dns2.namecheaphosting.com = 156.154.132.200 / 156.154.133.200).

This is the complete zone. Recreate every row below in the new DNS provider
**before** switching nameservers, then verify, then switch. Done in that order
there is no downtime and no gap in mail delivery.

Current nameservers (the ones being replaced):
    dns1.namecheaphosting.com
    dns2.namecheaphosting.com

---

## Records to recreate

### Website

| Type  | Host        | Value              | Notes |
|-------|-------------|--------------------|-------|
| A     | `@`         | `162.254.39.126`   | The WordPress store on Namecheap shared hosting |
| CNAME | `www`       | `nexphaselabs.net` | On Cloudflare use a CNAME to `nexphaselabs.net`; it flattens at the apex automatically |

### Mail routing — do not mistype these

| Type | Host | Priority | Value                    |
|------|------|----------|--------------------------|
| MX   | `@`  | 10       | `mx1.privateemail.com`   |
| MX   | `@`  | 10       | `mx2.privateemail.com`   |
| CNAME| `mail` | —      | `nexphaselabs.net`       |

Both MX records share priority 10 — that is correct and deliberate, not a typo.

### Email authentication

| Type | Host                  | Value |
|------|-----------------------|-------|
| TXT  | `@`                   | `v=spf1 include:spf.privateemail.com` |
| TXT  | `@`                   | `brevo-code:245e2cc6e7e2875a79f141b182bfb476` |
| TXT  | `_dmarc`              | `v=DMARC1; p=none; rua=mailto:rua@dmarc.brevo.com` |
| CNAME| `brevo1._domainkey`   | `b1.nexphaselabs-net.dkim.brevo.com` |
| CNAME| `brevo2._domainkey`   | `b2.nexphaselabs-net.dkim.brevo.com` |

**These are two separate TXT records on `@`, not one record with two lines.**
That distinction is what makes SPF valid. Keep them separate.

`default._domainkey` TXT — the full value, all 411 characters, one record:

```
v=DKIM1; k=rsa; p=MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAsURRN2Gx5dICsOguOyl/wDMKsaA2qTo+4aSuve3LCQT8l/YR+HeA/OCl85V8xMxtP3Rw0xwdxixRySS6Qvy/qMES69rHYTQqONQoTag2Q3g2Byyq64JdcJ5PtZ35zkS7SD8EiBWY3SWpuIVPA8Ah2nPmwmun1zuvn3/HPUi5W3Ptx0RO30BiLiGD/lKuGbe7uc6eTD9d5TOB7K1XdFPU4ToRw+dIrj9T5i6rusKUt+yHP9aBdWxxZlzHE6jAAT4Tgxkge/Wzo55Qygjaa057mQdTjWu1H7N2bjLma8EuX4pznzZpHIVuSxwJP6/6BHqoQsR5Ql8rZocaqdrj9ezatwIDAQAB;
```

### cPanel service records

All point at the same host as the website. Keep them while the WordPress site
is still on that hosting; they can be dropped once it is retired.

| Type | Host          | Value            |
|------|---------------|------------------|
| A    | `cpanel`      | `162.254.39.126` |
| A    | `webmail`     | `162.254.39.126` |
| A    | `webdisk`     | `162.254.39.126` |
| A    | `ftp`         | `162.254.39.126` |
| A    | `cpcalendars` | `162.254.39.126` |
| A    | `cpcontacts`  | `162.254.39.126` |

No CAA records exist. No AAAA records exist. No wildcard record exists.

---

## Improvements to make once the zone is under your control

Not part of the migration — do these after the switch has settled.

1. **Authorise Brevo in SPF and close the record.** The site sends all its mail
   through Brevo and SPF does not currently list it.
   Change the SPF record to:
   `v=spf1 include:spf.privateemail.com include:spf.brevo.com ~all`

2. **Get your own DMARC reports.** They currently go only to Brevo.
   `v=DMARC1; p=none; rua=mailto:dmarc@nexphaselabs.net,mailto:rua@dmarc.brevo.com`

3. **After two weeks of reading those reports,** tighten `p=none` to
   `p=quarantine`.

---

## Order of operations

1. Create the zone at the new provider with every record above. Change nothing
   at the registrar yet — the zone is inert until the nameservers point at it.
2. Check every row against this sheet. Twice for the MX and DKIM values.
3. Update the nameservers on the domain in your Namecheap account.
4. Watch propagation. The site and mail should behave identically throughout.
5. Only then apply the three improvements above.

Rollback: set the nameservers back to `dns1.namecheaphosting.com` and
`dns2.namecheaphosting.com`. The old zone stays intact at the hosting account,
so reverting restores the previous state exactly.
