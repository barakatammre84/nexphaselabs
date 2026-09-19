# Chapter 11 — Cutover Register

Source: NexPhase Launch Register, chapter 11 ("Cutover"), claude.ai artifact
`bbc231fa-c51c-4e20-85b1-b5bcc84995cd`, updated 12 September 2026. Artifact text mirrored in
`2026-09-12-cutover-register-artifact.txt`. Parent: `997fc7b6-a540-4deb-88d0-abc3ddcff2be`.

Kept the same way as the other chapters in this folder: one item at a time, complete means evidence,
anything needing a person is `owner action`, new findings are added here, every change logged.

**The ordering rule from §11.1 governs everything below: everything reversible happens before
anything irreversible, and the export happens before all of it.**

## Items

| # | id | Item | Owner | When | Status |
|---|----|------|-------|------|--------|
| 1 | `c11-export` | Export WordPress customers, orders, payments, products, content, media | Ammre | blocks order #1 | **procedure written** · owner action to run |
| 2 | `c11-exportrec` | Record what was exported, when, and where it is stored | Ammre | blocks order #1 | **record template written** · owner action |
| 3 | `c11-cold` | Understand the 11 Sep 1102 errors and confirm the Workers plan | Ammre | first month | owner action |
| 4 | `c11-coldmeasure` | Warm the top twenty paths after the switch and measure from two vantages | Ammre | first month | **built** — `npm run cutover:verify` |
| 5 | `c11-dns` | Add the DNS mail records first — additive and independent | Ammre | blocks order #1 | **verified and specified** · owner action to add |
| 6 | `c11-tell` | Tell existing WordPress account holders before the switch | Fatima | blocks order #1 | owner action |
| 7 | `c11-rails` | Turn on bank transfer and BTCPay before the domain moves | Ammre | blocks order #1 | **visible in the application** · owner action to configure |
| 8 | `c11-domain` | Point the domain at the worker as a Workers custom domain | Ammre | blocks order #1 | owner action |
| 9 | `c11-keephost` | Keep the WordPress host running and unchanged for weeks after | Ammre | blocks order #1 | owner action |
| 10 | `c11-triggers` | Write the rollback triggers before the day | Ammre | blocks order #1 | **drafted** · thresholds are his to set |
| 11 | `c11-mailwatch` | Watch mail for the first hour after the switch | Ammre | blocks order #1 | **procedure written** · owner action |
| 12 | `c11-decom` | Decide the old store's fate and the retention period | Melissa + Wisam | first month | owner action |

Found during this pass:

| # | id | Item | Owner | When | Status |
|---|----|------|-------|------|--------|
| 13 | `c11-new-1` | Three redirects pointed a path at itself — `/about`, `/faq`, `/contact` would have looped forever | Ammre | blocks order #1 | **fixed** |
| 14 | `c11-new-2` | The DNS zone document is stale: mail moved to Google Workspace and the nameservers changed | Ammre | blocks order #1 | **corrected** |

## Item detail

### 4. `c11-coldmeasure` — warming and measuring, from two vantages

**Built 13 September 2026.** `scripts/cutover-verify.ts`, run as `npm run cutover:verify`.

```bash
npm run cutover:verify                                   # the live domain
npm run cutover:verify -- https://staging-host           # after CLOUDFLARE_ENV=staging npm run build
npm run cutover:verify -- --json > vantage-a.json        # and again from a second machine
npm run cutover:verify -- --compare vantage-a.json vantage-b.json
```

It reads only — it fetches pages, submits nothing, changes nothing — and answers the six questions
the day actually turns on:

1. **Health.** Is the worker up, and which environment is it?
2. **Old URLs.** All 29 indexed paths, each checked against the decision in `lib/legacy-redirects.ts`
   — the same module the worker serves from, so the check cannot drift from the behaviour. Product
   URLs are accepted as either a 301 to their new page or a 410, because that decision belongs to
   the catalog; a 404 or a 200 fails. Paths the new build serves at the same address are followed
   through to a 200.
3. **Sitemap.** Present, non-empty, and leaking no `/manage`, `/staff`, `/account` or `/api` path.
4. **robots.txt.** Staff and customer paths out, sitemap declared, and no blanket `Disallow: /`.
5. **Indexability.** No `noindex` header on the live domain.
6. **Warming and timing.** The top twenty paths — the static pages plus every product and lot in the
   sitemap — fetched once to pull them into the edge cache, with the median and the five slowest
   printed.

**It checks a non-production origin as its mirror image**, which is what makes it usable on staging:
there the sitemap must be *empty*, robots must say `Disallow: /`, the `noindex` header must be
*present*, and the origin must hold the access boundary its build declares. Reporting correct staging
behaviour as three failures would have made the tool useless exactly where it gets most of its use.

**On timings**, §11.4 withdrew a 78-second figure that came from the measuring tool. This writes a
JSON report per vantage and compares two of them; if the medians disagree by more than 3× it says so
and tells you to suspect the measuring path, which is precisely how the withdrawn figure was
produced. It never pronounces on a timing from one machine.

Proven against the built worker in both modes — as `development` (sitemap empty, robots closed,
noindex present, no blockers) and as `production` (17 sitemap URLs including 5 products, all 29 old
URLs decided, robots correct, indexable, no blockers).

**Access check corrected 14 September 2026**, when the owner made staging public. It had required an
anonymous `GET /` to answer 401, so against public staging it reported correct behaviour as a blocker,
and it never asked whether staff pages and private APIs still refused a stranger. It now proves the
staging deploy's own boundary — `scripts/lib/staging-access.mjs`, which `scripts/staging-access-check.mjs`
also runs — with the mode read from the built configuration (`--config`, default
`dist/server/wrangler.json`) and never from what the origin answers. Open: public pages answer 200,
staff pages redirect to staff sign-in, private APIs answer 401 or 403. Closed: the password challenge
on every path. Both: `noindex` on every answer. `--user` is now needed only to see past a closed
staging's password. Production's checks are unchanged. `tests/cutover-verify.test.ts`.

### 5. `c11-dns` — the mail records

**Verified 13 September 2026** from three resolvers (1.1.1.1, 8.8.8.8, 9.9.9.9) with
`npm run dns:verify`. The finding in chapter 7 is confirmed and is worse than the register records,
because the zone itself has changed:

```
ok   MX     smtp.google.com
FAIL SPF    absent
FAIL DKIM   no selector resolves (google, default, selector1, selector2, brevo1, brevo2)
FAIL DMARC  absent
```

`scripts/dns-verify.mjs` checks MX, SPF, DKIM and DMARC, and prints the exact rows to add when
something is missing. It refuses to invent the DKIM key — that one is generated in the Workspace
admin console and cannot be written down in advance — and it knows the failure modes that look like
success: two SPF records (a permanent error that authenticates nothing), a record ending `+all`
(worse than no record), a DMARC record with no `p=` or no `rua=`, more than ten SPF lookups.
`tests/dns-records.test.ts` — 20 tests.

**Owner action:** add three records. They are additive — adding them cannot break mail that works
today — and nothing downstream can be tested until they exist.

### 10/11. `c11-triggers`, `c11-mailwatch` — the day itself

`docs/operations/CUTOVER_ROLLBACK_TRIGGERS.md`. Seven triggers with a recommended threshold and a
blank beside each for Ammre's number, plus the two that have no threshold because the harm is
disclosure rather than downtime: a page showing another customer's data, or a lot resolving that is
not released. Who calls the rollback, without waiting for anyone. The first-hour sequence including
the mail check in both directions. And what is explicitly *not* a trigger — the ranking drop and the
absent payment rail are the plan working, not faults.

One operational note in it that is easy to miss and expensive to skip: **set the apex TTL to 300
seconds at least 24 hours before the cutover**, so a rollback propagates in five minutes.

### 7. `c11-rails` — the rails, and knowing whether they are on

Both rails are complete in code and gated purely on configuration: bank transfer needs
`PAYMENT_BANK_INSTRUCTIONS`, BTCPay needs its four variables, and both need `APP_ENV=production` —
`livePaymentsAllowed()` refuses to let money move anywhere else. With nothing configured an order
still reaches awaiting-payment and a staff member records the payment by hand, so ordering never
strands.

What was missing was any way to see which rails were actually on without placing an order.
**`/manage/readiness` now has a Payment rails panel**: each rail marked live or off, and what it is
still waiting for by variable name. It reads presence only — no secret value is ever read into the
result, and a test asserts that neither a bank detail nor a BTCPay host appears in the output.
`paymentRailStatus()` in `lib/payments.ts`; four tests in `tests/environment-safety.test.ts`.

**Owner action:** set the variables in production. Until then the panel says `off` and names the
missing ones, which is the honest answer to "are we able to take money on the day".

### 1/2. `c11-export`, `c11-exportrec` — the irreversible step

`docs/operations/WORDPRESS_EXPORT.md`. Seven exports with where each lives in the WordPress admin,
five checks to run before trusting them ("an export nobody opened is not a backup"), a record table
to fill in, and the reminder that exporting is not decommissioning — the host stays running because
it is the entire rollback plan.

Two things the chapter's list does not mention and this adds: a crawl or PDF of the old product and
policy pages as they stand on the last day, because the claims on them are what a regulator would
read and after the cutover they exist nowhere; and the raw host backup, because if a CSV export
turns out to be incomplete the database is the only recovery.

### 13. `c11-new-1` — three redirects that pointed at themselves

**Found and fixed 13 September 2026**, by the verifier above on its first real run.

The chapter 1 redirect map sent `/about/`, `/faq/` and `/contact/` to `/about`, `/faq` and
`/contact`. But the map normalises the trailing slash *before* it looks a path up, so it matched the
**new** site's own pages too and redirected each of them to itself — an infinite loop on three pages
that exist today. The unit tests did not catch it: they asserted the old URL redirected correctly and
never asked what the new URL did.

Fixed by removing the three entries entirely. Those pages live at the same address on both sites, so
no entry is needed at all — the framework answers `/about/` with its own 308 to `/about` in one hop.
`legacyDecision()` also refuses to return a redirect whose target equals its source, so a future edit
cannot reintroduce the loop, and there are now tests for both.

The lesson is worth keeping: a redirect map is tested by asking what the *new* site does, not only
what the old URLs do.

### 14. `c11-new-2` — the DNS zone document was stale

`docs/operations/DNS-ZONE-nexphaselabs.net.md` was captured on 3 September and describes
`dns1/dns2.namecheaphosting.com`, `mx1/mx2.privateemail.com` and Brevo DKIM selectors. None of that
is true now: the nameservers are `dns1/dns2.registrar-servers.com`, mail is Google Workspace
(`smtp.google.com`), and the authentication records are gone. Recreating the zone from that sheet —
which is exactly what it tells you to do — would have pointed mail at the wrong provider.

Corrected with a dated block at the top of the file showing the snapshot against the live state, and
the instruction not to recreate the Brevo and privateemail rows. The old snapshot is kept below it
because it records what the previous zone held.

## Change log

- **2026-09-13 (rails)** — Added the payment-rails panel to `/manage/readiness` so `c11-rails` is a
  visible state rather than a guess. Configuration stays the owner's.
- **2026-09-13** — Chapter pulled and mirrored. Built the cutover verifier (`c11-coldmeasure`) and
  the DNS verifier, and used them: the verifier found `c11-new-1` (three self-redirecting paths) on
  its first run, and the DNS check confirmed `c11-dns` and produced `c11-new-2`. Wrote the rollback
  triggers, the first-hour sequence and the WordPress export procedure. What remains in this chapter
  is the owner's execution — the export, the DNS records, the rails, the domain, and the decisions.
