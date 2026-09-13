# Chapter 16 — Release Engineering Register

Source: NexPhase Launch Register, chapter 16 ("Release Engineering"), claude.ai artifact
`0442318b-54fb-463c-aae9-fc446bcf1537`, updated 12 September 2026. The artifact text is mirrored
verbatim beside this file in `2026-09-12-release-engineering-register-artifact.txt` so it can be
diffed when the artifact changes.

This file is the working copy. The artifact is the owner's view; this is the engineering record
that says what was actually done, where the evidence is, and what is still waiting on a person.

## How this register is kept

- **One item at a time.** An item is not left half-done to start the next one.
- **Complete means evidence.** Code that exists but has never run in the environment it protects is
  `built, unproven`, not `done`. Anything that needs a human decision, a credential, or a second
  person is `owner action` — Claude prepares it and does not mark it complete.
- **New findings are added here**, numbered `c16-new-N`, with what was found and why it matters.
- Every status change is appended to the change log at the bottom, with the date.

Status values: `done` · `built, unproven` · `in progress` · `owner action` · `open`

## Items

| # | id | Item | Owner | When | Status |
|---|----|------|-------|------|--------|
| 1 | `c16-merge` | Merge the operations-repair branch deliberately, with someone watching | Ammre | blocks order #1 | owner action |
| 2 | `c16-guard` | Add the deploy guard | Ammre | blocks order #1 | **done** |
| 3 | `c16-tagonly` | Make the v\* tag the only path to production | Ammre | blocks order #1 | **done** |
| 4 | `c16-protect` | Protect staging | Ammre | blocks order #1 | **done in code** · secret is an owner action |
| 5 | `c16-noindex` | Add a noindex header to the staging origin | Ammre | blocks order #1 | **done** |
| 6 | `c16-backup` | Complete the D1 and R2 backup and restore rehearsal | Ammre | blocks order #1 | **runnable** · one command, needs credentials |
| 7 | `c16-rto` | Record the elapsed recovery time | Ammre | blocks order #1 | **automatic** once #6 runs |
| 8 | `c16-witness` | Witness the recovery result and record business acceptance | Melissa + Wisam | blocks order #1 | owner action |
| 9 | `c16-controls` | Seed the thirty launch-critical controls with owners and due dates | Ammre | blocks order #1 | **built** · one screen, needs the admin to apply it |
| 10 | `c16-evidence` | Attach evidence and record approval for each launch-critical control | Melissa + Wisam | blocks order #1 | owner action |
| 11 | `c16-1102` | Fix the cold-asset waterfall | Ammre | blocks order #1 | **largely done** · re-measure on staging |
| 12 | `c16-plan` | Confirm the Cloudflare Workers plan and read the persisted logs | Ammre | first month | owner action |
| 13 | `c16-man002` | Write deploy, rollback and restore into MAN-002 as exact commands | Ammre | blocks order #1 | **done** |
| 14 | `c16-creds` | Record where every credential lives and who can obtain it | Ammre | blocks order #1 | **done** |
| 15 | `c16-secondpair` | Have a member walk a rollback on staging once, with Ammre watching | Wisam | blocks order #1 | **script written** · owner action to run |
| 16 | `c16-fallback` | Name a technical fallback for the cutover window | Melissa + Wisam | first month | owner action |

Found during this pass and added to the register:

| # | id | Item | Owner | When | Status |
|---|----|------|-------|------|--------|
| 17 | `c16-new-1` | The staging gate did not cover static assets — Workers Assets serves them ahead of the worker | Ammre | blocks order #1 | **done** |

## Item detail

### 1. `c16-merge` — merge the operations-repair branch deliberately

The 9 September repair set is **not** sitting on `save/operations-repair-2026-09-09` alone any more:
it is committed on `launch/launch-pass-2026-09-12` as `f48c03c`, together with two later commits
(`0a79634`, `49ea91f`). `main` is three commits behind that branch.

A merge to `main` runs `deploy-staging.yml`: checks, build, **migrate staging D1**, seed, deploy,
smoke test. So the merge is a deployment and needs a person watching it.

Migrations 0041–0050 are involved. 0041–0049 are already applied to staging; 0050
(`0050_launch_attestation_tier.sql`) is from the 12 September launch pass.

**Completion:** `main` carries the launch branch, the staging deploy ran green, and the smoke test
passed. Requires the owner to say go.

### 2. `c16-guard` — deploy guard

`scripts/deploy-guard.mjs` refuses to hand a built worker to wrangler unless
`dist/server/wrangler.json` provably targets the environment named on the command line. It checks
worker name, `targetEnvironment`, `APP_ENV`, D1 database name, R2 bucket name and the
`PUBLIC_ORIGIN` host; prints every field with ok/BAD; exits non-zero on any mismatch; and never
guesses. Production additionally requires `NX_CONFIRM_PRODUCTION=yes`.

Wired into `npm run deploy:staging`, `npm run deploy`, `deploy-staging.yml` and
`deploy-production.yml`.

**Closed 12 September 2026.** The guard existed but had never been watched refuse anything, and in
the staging workflow it ran *after* the migration step — so a mis-targeted build would have been
caught only once the database had already been changed.

- `tests/deploy-guard.test.ts` runs the real script as a child process and reads its exit code:
  the 9 September failure (a production build deployed as staging) is refused; the reverse is
  refused; each single wrong field — name, `APP_ENV`, database, bucket, origin,
  `targetEnvironment` — is refused on its own; an absent or misspelt target exits 2 rather than
  guessing; and production exits 1 without `NX_CONFIRM_PRODUCTION=yes` even when the configuration
  is correct. 7 tests, green.
- `scripts/deploy-guard.mjs` takes an optional second argument naming the built configuration, which
  is what makes the refusals testable.
- `deploy-staging.yml` now runs the guard **before** the migrate step, and again immediately before
  the upload.

Evidence: `npx vitest run tests/deploy-guard.test.ts` → 12 passed (7 for the guard, 5 for the tag
rule below). And run against the tree as it actually stands — a staging build sitting in `dist/` —
`NX_CONFIRM_PRODUCTION=yes node scripts/deploy-guard.mjs production` prints six BAD lines and exits
1. That is the 9 September failure, refused.

### 3. `c16-tagonly` — the v\* tag is the only path to production

`deploy-production.yml` triggers on `push: tags: ['v*']`.

**Closed 12 September 2026.** Two other ways into production existed.

- `workflow_dispatch` on `deploy-production.yml` would deploy whatever ref was chosen, including a
  branch. The trigger is kept — an interrupted release has to be re-runnable — but the first step of
  the job now refuses any run whose `github.ref_type` is not `tag` or whose tag is not `v*`. It runs
  **before** checkout, install, migration or deploy, so a wrong ref costs nothing.
- `npm run deploy` from a laptop bypassed GitHub entirely. `scripts/deploy-guard.mjs` now requires,
  for production only: `NX_CONFIRM_PRODUCTION=yes`, **and** HEAD at a `v*` tag, **and** — when the
  tag came from git rather than a workflow ref — a clean working tree, so what is uploaded is what
  the tag names. Emergencies do not need an exception: tagging is one command and leaves a record.
- The guard also runs immediately after the production build, before migrations.

Staging is unaffected: it deploys from `main` and is not tagged.

### 4. `c16-protect` — protect staging

`lib/environment-gate.ts`, called from `worker.ts` before anything else, puts HTTP Basic auth in
front of every non-production request except `/api/health` and the provider webhooks.

**Closed in code 12 September 2026.** The gate was written but it **failed open**: with
`STAGING_ACCESS_PASSWORD` unset it logged one console warning per isolate and served the request.
That is the configuration staging is deployed in, which is why 16.3 describes a public storefront
even though this code exists. Nobody reads an isolate's console.

- The gate now **fails closed**. A deployed non-production environment with no password answers
  every non-exempt request with **503** and a body naming the variable and the command to set it. A
  missing secret is now a broken deploy — loud — instead of an open shop — silent.
- Local development is never gated. `APP_ENV` of `development`, `test`, `local`, or unset is local;
  unset resolves to development, the same default `lib/site-config.ts` already uses. Case is not
  folded and unknown values are not guessed: `Production`, `prod` or `preview` all require a
  password, because the safe direction for an environment the gate cannot name is closed.
- `STAGING_ACCESS_OPEN=true` opens it again deliberately. Exactly that string — a stated choice
  sitting in the configuration where it can be read, not a default.
- `tests/environment-gate.test.ts` — 11 tests, the first this module has ever had.
- The staging workflow now **proves** it after every deploy: an anonymous `curl` of `/` must answer
  401 and carry `X-Robots-Tag: noindex`. A 200 fails the job with "staging is OPEN"; a 503 fails it
  with the `wrangler secret put` command.

Proven end to end against the real worker, not just the module — `wrangler dev` on the staging
build with `APP_ENV=staging`:

| request | result |
|---|---|
| anonymous `GET /` | **401** + `WWW-Authenticate: Basic realm="NexPhase staging"` + noindex |
| anonymous `GET /api/lots/TEST-001` (the API serving the fabricated manufacturer) | **401** |
| wrong password | **401** |
| correct password, `/` and `/catalog` | **200** |
| `GET /api/health` (exempt, so the smoke test still works) | reachable |
| `APP_ENV=staging` with no password set | **503** on everything, including with the right password |

**Still an owner action:** the secret does not exist on the staging worker yet. Until it is set, the
deployed environment will refuse every request — which is the point, but it means the next staging
deploy fails its new smoke step until this is run:

```bash
npx wrangler secret put STAGING_ACCESS_PASSWORD --env staging
```

Known consequence: `/api/digest` on staging now sits behind the gate too. It is admin-level content
and its own bearer token still applies; if an external scheduler is ever pointed at staging it will
need the Basic credentials as well.

Evidence for `access.staging`, the launch-critical control: this section, plus the smoke step's
output on the first staging deploy after the secret is set.

### 5. `c16-noindex` — noindex on the non-production origin

`withNoindex()` in `lib/environment-gate.ts` sets `X-Robots-Tag: noindex, nofollow` on every
non-production response, and `app/robots.ts` serves `Disallow: /` when `APP_ENV` is not production.

**Closed 12 September 2026.** Confirmed live on the running worker: `X-Robots-Tag: noindex, nofollow`
is present on the storefront in both `development` and `staging`, on the 401 challenge and on the
503 refusal, and absent in production. It does not overwrite a stricter tag a page has already set,
and it preserves the status, headers and body of the response it wraps. Covered by
`tests/environment-gate.test.ts`; asserted after every staging deploy by the workflow step above.

### 6. `c16-backup` — complete the backup and restore rehearsal

`scripts/d1-backup.mjs` and `scripts/d1-restore-verify.mjs` exist with a written runbook
(`docs/operations/BACKUP_AND_RESTORE_RUNBOOK.md`). The export failed with Cloudflare auth error
10000 and the rehearsal has never completed end to end.

**Completion:** export D1 and R2 for a named environment with the checksum manifest; restore into an
isolated environment; run integrity, foreign-key and table checks; record elapsed time; witnessed.

**12 September 2026 — the rehearsal is now one command instead of a manual sequence.**

The five steps were written down but never driven by anything, so a rehearsal could stop at step 2
— which is what happened — and leave nothing behind. `scripts/recovery-rehearsal.mjs` runs the whole
sequence, times each phase, and writes both a machine record and a report with a witness block.

```bash
npm run ops:rehearsal:staging -- /absolute/private/recovery-dir
```

- **Credentials are checked before anything is touched.** The rehearsal previously died at the
  export with Cloudflare auth error 10000 and no explanation. The preflight now detects that exact
  code and prints what it actually means — a rejected token, not a missing database — with the four
  things to check in order: the token exists and has not expired, it carries D1 Edit and R2 Edit,
  it is scoped to the account holding the database, and it is exported into the shell.
- **The document half is not optional.** No `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY` means the
  R2 phase is `skipped` and the verdict is **INCOMPLETE**, not passed: a database restored without
  its evidence files is not a recovery. The report says so in those words.
- **R2 is copied and restored for real**, over the S3 API (SigV4 is implemented in the script, so
  there is no extra tool to install): list the source bucket with pagination, download every object,
  write a key/size/ETag/sha256 manifest, create a *separate* `…-rehearsal-<date>` bucket, put every
  object back, re-list it, and compare counts, bytes and checksums. Nothing writes to a source
  bucket. The rehearsal bucket is left in place and the delete command is printed.
- **Production is refused** without `NEXPHASE_CONFIRM_PRODUCTION_BACKUP=yes`, and the output
  directory may not be the repository, `$HOME`, or `/`.
- `tests/recovery-rehearsal.test.ts` — 16 tests. They pin the verdict rules (a skipped phase is
  incomplete; a failure names its phase; "nothing ran" is not a pass), the manifest comparison (a
  missing document, a truncated document, an unexpected extra, ETag quoting, and R2's absent ETag on
  multipart objects), the report's contents, and the driver's refusals — including that a missing
  token stops it at preflight *and still writes a record*, with no `.sql` file produced.

**Still an owner action:** the run itself. It needs a Cloudflare API token and R2 S3 credentials,
which are the owner's to hold, and it reads real data to a private directory.

### 7. `c16-rto` — record the elapsed recovery time

Falls out of the rehearsal: the rehearsal must time itself and write the number down.

**12 September 2026 — closed in the tooling.** Every phase is timed and the total is printed, put in
the JSON record, and written into the report as "**Elapsed, export to verified restore**", beside
the data volume it was measured on (`N documents (X MB) and the staging database`) and a line saying
to re-measure when the data grows. There is no way to complete a rehearsal now without producing the
number. It becomes a real recorded objective when the owner runs #6 and a member accepts it as the
target.

### 8. `c16-witness` — witness the recovery result

Per the deployment-and-recovery handoff rule in
`docs/THREE_PERSON_OPERATING_MODEL_2026-09-09.md`: the technology seat performs, Quality or
Operations witnesses the staging result and records business acceptance.

**Prepared 12 September 2026.** The rehearsal report ends with the block to sign — witness name and
role, date witnessed, whether the measured recovery time is accepted as the objective, exceptions
accepted or case opened, evidence folder — and a line stating that a control cannot be marked ready
without an owner and evidence. Nothing else is needed from engineering: this waits on #6 running and
then on Melissa or Wisam. Ammre performs it and does not sign it.

### 9. `c16-controls` — seed the thirty launch-critical controls

`CONTROL_DEFINITIONS` in `lib/operational-controls.ts` holds all thirty, every one
`launchCritical: true`. The table is empty: no owner, no due date, no evidence on any of them.

The rules the seed must respect — they are enforced in `updateOperationalControl()` and must not be
bypassed by seeding straight into the table: an owner is required before work starts, evidence is
required before `awaiting_review` or `ready`, a reason is required for `blocked` or
`not_applicable`, and only an administrator records readiness. Seeding assigns **owner and due date
only**.

**12 September 2026 — built as a screen, not a SQL file.** Assigning thirty owners one form at a
time is a job nobody starts, which is why the register sat empty. `/manage/controls` now opens, for
an administrator, with an assignment panel listing every control that has no owner.

- Each row arrives pre-set to the seat the operating model puts that control under
  (`suggestedRole` on each definition: Business & Systems, Quality & Supply, or Customer &
  Fulfillment — 12 / 9 / 9 across the thirty). The administrator can change any row, or leave one
  unassigned, before applying.
- One due date applies to the batch, defaulting to two weeks out.
- Every row goes through `updateOperationalControl()` — the same path as a single edit — so each
  assignment is attributed to the signed-in administrator and appended to the control history.
  Nothing is written straight into the table.
- It carries existing work through: a control already `in_progress` with a note keeps both.
- It is safe to run twice — the second pass reports "already matched" and writes no new history.
- **It cannot manufacture a readiness decision.** The panel has no status field, no evidence field
  and no "ready" option; the tests assert their absence in the rendered markup as well as in the
  result.
- A bad row (unknown control, departed staff member, malformed date) is reported by name and does
  not stop the good rows.

`tests/control-assignment.test.ts` — 15 tests against a real SQLite database, including the
three assertions that matter after a full assignment run: every control has an owner and a due date,
every control is still `not_started`, and no control has evidence.

**Still an owner action:** Ammre signs in as administrator and applies it. He seeds and chases; the
members approve. Verified by rendering the panel in tests rather than in a browser, because
`/manage` is behind staff sign-in.

### 10. `c16-evidence` — attach evidence and record approval

Members' work, in the application at `/manage/controls`. Ammre seeds and chases; he owns none of the
approvals.

**Unblocked 12 September 2026** by #9: once the assignment is applied, every control has an owner and
a date, which is what turns "attach the evidence" from a project into a queue. The rules the
application already enforces: evidence is required before a control can be submitted for review or
marked ready, a reason is required to block or waive one, and only an administrator records the final
decision. Two controls can be evidenced from this pass — `access.staging` (#4, #17) and
`continuity.backup` (#6, once the rehearsal runs).

### 17. `c16-new-1` — the gate did not cover static assets

**Found 12 September 2026 while proving #4.** With the password gate on and the storefront answering
401, this still returned 200 to an anonymous request:

```
GET /_next/static/chunks/index-….js    200
GET /_next/static/css/index.….css      200
GET /favicon.svg                       200
```

Workers Assets serves files in the asset directory **ahead of** the worker, so `worker.ts` — and
therefore the gate — never saw them. "Staging is protected" would have been true of the pages and
the APIs and false of everything else: the client bundles, the product images and the client
manifest were all downloadable by anyone with the URL.

**Closed.** `env.staging` sets `assets.run_worker_first: true`, so every staging request passes the
gate first. `worker.ts` then serves real assets from the `ASSETS` binding — `/_next/static/*` short
-circuits straight there (the hot path, no framework routing), and anything else that reaches the
handler as a 404 is looked up in the asset store and returned only if it genuinely exists, so the
application's own not-found page still wins for unknown routes.

Production is deliberately untouched: the production build carries no `run_worker_first`, assets are
served without a worker invocation, and the branch never runs. Confirmed by inspecting both built
configurations.

Proven on the running staging build:

| request | anonymous | with the password |
|---|---|---|
| `/`, `/catalog` | 401 | 200 |
| `/_next/static/chunks/index-….js` | 401 | 200, 209KB, `immutable` intact |
| `/favicon.svg` | 401 | 200 |
| `/vinext-client-entry-manifest.json` | 401 | 200 |
| `/this-route-does-not-exist` | 401 | 404, the application's own page |

### 11. `c16-1102` — cold-asset waterfall

148 requests per page, 36 chunks of ~19KB each stalling 21–23s, 78s to interactive on a cold load.
Precondition for the cutover.

**12 September 2026 — measured, and the largest cause was not the chunks.**

Loading the built production worker and reading the network log showed what a cold homepage actually
does. Alongside the bundles it fired **eleven `?_rsc=` prefetches** — `/catalog`, `/documentation`,
`/about`, `/faq`, `/contact`, `/access`, `/account/sign-in`, `/documentation/lot-lookup`, `/`,
`/catalog/bpc-157` — and each of those is a **full server render**, on a cold worker, with its own
database queries, competing with the render the visitor is actually waiting for. They also drag in
the client chunks of those routes (`lot-lookup`, `contact-form`, `faq-explorer`, three icon chunks),
so they inflate the chunk count too. Next prefetches every `<Link>` as it enters the viewport, and
the header, mobile menu and footer are on every page.

Fixed:

- `components/site/nav-link.tsx` — a `NavLink` for the site chrome that passes `prefetch={false}`.
  Header, mobile menu and footer use it. Links in the body of a page still prefetch: those are the
  ones a visitor is about to follow. Nothing is lost on hover — `prefetch={false}` disables the
  viewport prefetch, not the hover one.
- `components/site/feedback-chat.tsx` — the widget called `/api/feedback?peek=1` on every page load
  for an unread badge nobody had asked for yet. It now waits for `requestIdleCallback` (1.2s timer
  where that is unavailable), so a visitor's first impression no longer includes a server round-trip
  for a support widget they have not opened.

Measured on the built worker, same page, same conditions:

| | before | after |
|---|---|---|
| RSC server renders on load | 11 | 3 (the homepage's own catalog/product/documentation links) |
| JS chunk requests | 41 | 35 |
| Total requests | ~60 | 48 |
| Blocking API calls | 1 (`/api/feedback`) | 0 (deferred to idle) |

Verified afterwards in the browser: the page renders, the console is clean, and client-side
navigation still works from both a body link and a footer `NavLink`.

**What is not fixed, and why.** The remaining ~35 chunks are the framework's own client split.
`vinext/dist/build/client-build-config.js` installs a `manualChunks` function that deliberately
produces a `framework` chunk (React, ReactDOM, scheduler), a `vinext` runtime chunk, and leaves the
rest to graph-based splitting; it overrides `build.rollupOptions.output`, so an `advancedChunks`
group set in `vite.config.ts` is ignored. That was tested, not assumed: with a group matching all of
`node_modules` the output was byte-identical at 69 chunks, so the experiment was reverted rather than
left in as configuration that does nothing. Reducing the count further means reducing the number of
distinct `'use client'` components and lucide icons on a page, or a framework change.

**Still to do:** re-measure on the deployed staging worker once the gate secret is set, with a cold
isolate, and record the number beside the 78s that started this item. Local timings cannot stand in
for a cold edge load.

### 12. `c16-plan` — Cloudflare plan and persisted logs

Owner action in the Cloudflare dashboard. Not the cause of the slow pages — #11 measured the actual
cause, which was eleven server renders fired by link prefetching on every page load.

What to look at when it is done: the Workers plan and its CPU-time limit, and the persisted logs for
the staging worker (`observability.enabled` is already true in `wrangler.jsonc`, so they are being
kept). `npx wrangler tail` gives the live view; the dashboard holds the history.

### 13. `c16-man002` — deploy, rollback and restore in MAN-002

`operations/manuals/MAN-002_Technical_Operations_and_Recovery_Manual.docx` is generated by
`scripts/build-operations-manuals.py`. The commands must go into the generator, not the .docx, or
the next build erases them.

**Closed 12 September 2026.** The manual described the procedures — "run the staging D1 backup
script with the absolute directory path" — which is not something a second person can follow at two
in the morning. It now contains **44 literal command lines**, monospaced and shaded, under a section
that opens: *type these verbatim*.

- **Exact commands** — confirm the account and shell first (`wrangler whoami`, `git status`).
- **Deploy to staging** — the merge, what it triggers, how to watch it, and the by-hand equivalent
  if GitHub is unavailable; what the guard and the two smoke steps mean.
- **Release to production** — tag, push, watch; the break-glass local path and its preconditions.
- **Roll back** — `deployments list`, `rollback`, and how to prove it landed. States plainly what a
  rollback does *not* fix: migrations are backward compatible so the older worker keeps running, but
  wrong data is an incident, not a rollback.
- **Back up and restore** — the one-command rehearsal, the production confirmation, the individual
  steps, what error 10000 actually means, and Time Travel framed as a data decision that discards
  everything written since the timestamp.
- **Staging access** — setting the secret, and proving the restriction from outside.
- **Where the credentials live** — the table from #14.

Written in the generator, not the document. Regenerated with `python3
scripts/build-operations-manuals.py` (needs `python-docx`; it was not installed on this machine, so
it was run from a throwaway virtualenv) and the output verified: 18 headings, 44 command lines.

### 14. `c16-creds` — where every credential lives

Locations and the access path, never the credentials themselves.

**Closed 12 September 2026.** `docs/operations/CREDENTIAL_LOCATIONS.md` is the working record and
MAN-002 carries the controlled copy of the same table; the file says to regenerate the manual when it
changes, so they cannot drift silently.

It is complete rather than representative: every key in `db/env.d.ts` was enumerated (51) and split
into the 13 non-secret variables that live in `wrangler.jsonc` and the secrets that live in the
Worker secret store, each with where it lives, who can obtain it, and what uses it. Accounts and
platforms, deploy and recovery credentials, and the required Cloudflare token scopes are recorded
alongside. The rotation rule is stated: replace at the provider, set again through the command that
owns it — a credential pasted somewhere it should not be is rotated, not watched.

No value appears in it, and it ends by naming the thing it cannot fix: only one person can obtain any
of these today, which is `c16-fallback`.

### 15. `c16-secondpair` — a member walks a rollback

Needs a written walkthrough short enough to follow under pressure, then Wisam runs it on staging
with Ammre watching.

**Script written 12 September 2026** — `docs/operations/ROLLBACK_WALKTHROUGH.md`. Twenty minutes,
addressed to the second person rather than to the operator: what you need in your own name before you
start, read the current deployment and write the id down, watch a real deploy go out and read the
three steps that matter, roll it back, prove it, then answer three questions out loud without looking
anything up — where you would look for the cause, what a rollback does not fix, and who you tell.

It ends by asking for the case record, and asks explicitly for anything confusing or wrong in the
document itself to be fixed before the case is closed — the rehearsal tests the instructions as much
as the person. Production is deliberately out of scope: nobody rehearses on production.

**Still an owner action:** Wisam runs it, Ammre watches.

### 16. `c16-fallback` — a technical fallback for the cutover window

Owner action. Nobody except Ammre can deploy today.

**Prepared 12 September 2026.** A fallback is only useful if there is something for them to follow
and something for them to log in with. Both now exist: MAN-002 carries the exact deploy, rollback and
restore commands, `docs/operations/CREDENTIAL_LOCATIONS.md` says where every credential lives and who
can obtain it, and `docs/operations/ROLLBACK_WALKTHROUGH.md` is a twenty-minute rehearsal for a
second person.

What remains is the decision and the access: name the person — a member or an external contractor on
standby for the cutover window — give them their own Cloudflare and GitHub accounts rather than a
shared login, and record them in the credential file with the date.

## Change log

- **2026-09-12 (later)** — Worked the register in order. Closed `c16-guard`, `c16-tagonly`,
  `c16-noindex`, `c16-man002`, `c16-creds`, and the new `c16-new-1`. Closed `c16-protect` in code
  (the gate had been failing open, which is why staging was browsable) and `c16-1102` apart from a
  re-measurement on staging. Made `c16-backup`/`c16-rto` a single timed command and `c16-controls` a
  single screen. Wrote the rollback walkthrough for `c16-secondpair`. Found and closed `c16-new-1`:
  the staging gate did not cover static assets. Test count 630 → 684, typecheck and build clean.
  What is left is owner and member action: the merge, the staging secret, the rehearsal run, the
  assignment, the evidence, the rollback rehearsal, the Cloudflare plan, and the fallback.
- **2026-09-12** — Register pulled from the artifact and mirrored into the repo. Every item verified
  against the tree at `49ea91f`: `c16-guard` found already built and wired; `c16-protect` and
  `c16-noindex` found built in `lib/environment-gate.ts` but unproven in the deployed environment;
  `c16-merge` restated (the work is on `launch/launch-pass-2026-09-12`, not only on the save
  branch). 630 tests green at the time of writing.
