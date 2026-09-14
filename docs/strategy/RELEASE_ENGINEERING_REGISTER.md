# Chapter 16 — Release Engineering Register

Source: NexPhase Launch Register, chapter 16 ("Release Engineering"), claude.ai artifact
`0442318b-54fb-463c-aae9-fc446bcf1537`, updated 12 September 2026. The artifact text is mirrored
verbatim beside this file in `2026-09-12-release-engineering-register-artifact.txt` so it can be
diffed when the artifact changes.

This file is the working copy. The artifact is the owner's view; this is the engineering record
that says what was actually done, where the evidence is, and what is still waiting on a person.

Chapter 16 is one of eighteen. The parent — NexPhase Launch Register, artifact
`997fc7b6-a540-4deb-88d0-abc3ddcff2be`, Rev. 7 — holds the client-journey chapters (01 Discovery …
10 Customer record), the operating registers (11 Cutover, 12 Product posture, 13 Inventory,
14 Governance, 15 Quality system, **16 Release engineering**, 17 Finance) and 18 Launch handover,
with roughly 330 open items in total. Read the parent's **Corrections** section before trusting any
number quoted in a chapter: one of them lands directly on this one (see #11).

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
| 1 | `c16-merge` | Merge the operations-repair branch deliberately, with someone watching | Ammre | blocks order #1 | **merged** · staging deploy blocked by #18 |
| 2 | `c16-guard` | Add the deploy guard | Ammre | blocks order #1 | **done** |
| 3 | `c16-tagonly` | Make the v\* tag the only path to production | Ammre | blocks order #1 | **done** |
| 4 | `c16-protect` | Protect staging — **revised 14 Sep:** public by owner decision; what is protected is the public/private boundary | Ammre | blocks order #1 | **built, unproven in the deploy job** · holds on live staging (run by hand 14 Sep) · first job run waits on #18 |
| 5 | `c16-noindex` | Add a noindex header to the staging origin | Ammre | blocks order #1 | **done** · bundle exception recorded 14 Sep |
| 6 | `c16-backup` | Complete the D1 and R2 backup and restore rehearsal | Ammre | blocks order #1 | **runnable** · one command, needs credentials |
| 7 | `c16-rto` | Record the elapsed recovery time | Ammre | blocks order #1 | **automatic** once #6 runs |
| 8 | `c16-witness` | Witness the recovery result and record business acceptance | Melissa + Wisam | blocks order #1 | owner action |
| 9 | `c16-controls` | Seed the thirty launch-critical controls with owners and due dates | Ammre | blocks order #1 | **built** · one screen, needs the admin to apply it |
| 10 | `c16-evidence` | Attach evidence and record approval for each launch-critical control | Melissa + Wisam | blocks order #1 | owner action |
| 11 | `c16-1102` | Fix the cold-asset waterfall | Ammre | ~~blocks order #1~~ · downgraded by Correction 5 | **prefetch pile-up fixed** · chunk count is a modest optimisation |
| 12 | `c16-plan` | Confirm the Cloudflare Workers plan and read the persisted logs | Ammre | first month | owner action |
| 13 | `c16-man002` | Write deploy, rollback and restore into MAN-002 as exact commands | Ammre | blocks order #1 | **done** |
| 14 | `c16-creds` | Record where every credential lives and who can obtain it | Ammre | blocks order #1 | **done** |
| 15 | `c16-secondpair` | Have a member walk a rollback on staging once, with Ammre watching | Wisam | blocks order #1 | **script written** · owner action to run |
| 16 | `c16-fallback` | Name a technical fallback for the cutover window | Melissa + Wisam | first month | owner action |

Found during this pass and added to the register:

| # | id | Item | Owner | When | Status |
|---|----|------|-------|------|--------|
| 17 | `c16-new-1` | The staging gate did not cover static assets — Workers Assets serves them ahead of the worker | Ammre | blocks order #1 | **done** · revised 14 Sep for open mode |
| 18 | `c16-new-2` | **There is no `CLOUDFLARE_API_TOKEN` repository secret.** Neither deploy workflow can authenticate, and it is the same cause as the backup rehearsal's error 10000 | Ammre | blocks order #1 | **owner action** |

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

**12 September 2026 — merged on the owner's instruction; the deploy did not complete.** `main` is at
`ffaba2b` and carries the launch pass and this pass. The Deploy staging workflow ran and failed at
**Apply migrations**, which is #18: there is no `CLOUDFLARE_API_TOKEN` secret in the repository.

What that means in practice, and it is better news than it sounds:

- Nothing was applied and nothing was deployed. The run stopped before the database was touched —
  which is the order the workflow was rearranged into earlier today.
- Staging is unchanged and still serving the previous worker.
- Everything before the migration passed: checks, the staging build, the origin match, and the
  **deploy guard**, which confirmed the built configuration targets staging.

This item stays open until the token exists and the run is repeated: `gh run rerun 34736986650` or
a fresh push.

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

**14 September 2026 — reconciled with the owner's decision to make staging public.** This supersedes
the 401 expectations, the password owner action and the evidence plan above. None of those is being
marked ready.

The owner chose public staging on 14 September 2026 and the Basic-auth secret was removed (Ammre's
technical completion register, reviewed the same day, order 1). What is protected now is not the whole
environment but the line between the public storefront and everything behind a login.

What was actually running, read from Cloudflare and probed anonymously that day:

- Staging version `3d0e9b53-a54c-4279-b3f1-4ae2d5952875`, uploaded by hand at 16:53 UTC, had
  `STAGING_ACCESS_OPEN` as a **Worker secret** and no `STAGING_ACCESS_PASSWORD`. The decision was live
  and invisible: nothing in the repository said it, nobody can read a secret's value back, and the
  workflow's last step still demanded 401 — so the first automated deploy after #18 would have failed
  the approved configuration as "staging is OPEN".
- `access.staging` in the staging database still said "Becomes Ready when STAGING_ACCESS_PASSWORD is
  set", and its description still said "restricted to approved testers".

What changed:

- **The mode is declared.** `wrangler.jsonc` env.staging vars carry `STAGING_ACCESS_OPEN` = `true` with
  the reason beside it, so the decision is reviewed with the code and baked into
  `dist/server/wrangler.json`.
- **The deploy's last step proves the boundary for the declared mode.**
  `scripts/staging-access-check.mjs` replaces the inline curl. It reads the mode from the built
  configuration, never from the answers — inferring it would pass 16.3 — and reads redirects without
  following them:

  | mode | paths | each must answer |
  |---|---|---|
  | open | `/`, `/catalog`, `/favicon.svg` | 200, noindex |
  | open | `/manage`, `/manage/orders`, `/manage/controls` | a redirect to this origin's `/staff/sign-in` (or 401/403), noindex |
  | open | `/api/manage/reports/orders.csv`, `/api/manage/reports/lots.csv`, `/api/orders/NX-00000/invoice` | 401/403, noindex |
  | closed | all nine | 401 with the Basic challenge, noindex |

  A staff page or private API that answers a stranger, a redirect anywhere but staff sign-in, a 404 or
  500 where a login should be, a missing noindex, a password challenge when the configuration says open,
  or an open storefront when it does not: each fails the deploy.
- **A secret may not decide the mode.** A new step, before the migration, refuses to deploy while
  `STAGING_ACCESS_OPEN` exists as a Worker secret.
- `tests/staging-access-check.test.ts` — 16 tests. The real script runs against a stand-in worker built
  from the real gate in `lib/environment-gate.ts`, in each state above; three more assert that the deploy
  job ends with the check, refuses the secret before migrating, and that only staging declares open mode.
- **`access.staging`.** Description revised to the boundary. The stale note was replaced by an
  append-only correction in `drizzle/seed/controls-owners.sql` (change `oce_5f0d66c9e9c7658e9ae617c1`)
  that lands only while the launch-pass change is still the latest, so a later edit by a person wins. It
  was tested on fresh, repeated, staging-shaped and person-edited SQLite databases, then applied to
  staging D1: one control row updated, one event appended, the launch-pass event untouched. Status stays
  `in_progress` and evidence stays empty; across all thirty, 14 in progress, 16 not started, none with
  evidence — as before.
- The gate's header comment, `docs/DEPLOY.md`, `docs/operations/CREDENTIAL_LOCATIONS.md`,
  `docs/operations/ROLLBACK_WALKTHROUGH.md` and the MAN-002 generator now describe public staging.
  **The MAN-002 .docx has not been regenerated** — `python-docx` is not installed on this machine.

Proven:

| run | configuration read | result |
|---|---|---|
| live staging, 17:40 UTC | this branch's `dist/server/wrangler.json` (open) | **exit 0** — 3 public 200 + noindex, 3 staff 307 → `/staff/sign-in`, 3 private 401 |
| built staging worker (`wrangler dev`), nothing overridden | the same (open) | exit 0, identical answers |
| built worker, password set, switch overridden off | closed | exit 0 — 401 challenge on all nine |
| built worker behind the password | open | **exit 1** — "still asks for the password" |
| the previous build, opened without declaring it (16.3 shape) | closed | **exit 1** — "staging is OPEN … never as a Worker secret" |

Typecheck clean, lint unchanged (one existing warning), 700 tests green.

**Still to do, in order:**

1. #18 — the Cloudflare API token.
2. Immediately before the first deploy that carries this change:
   `npx wrangler secret delete STAGING_ACCESS_OPEN --env staging`. Until that deploy finishes, staging
   answers 503 to everything except health — the gate failing closed, loud and brief. The new step
   refuses to deploy while the secret exists, so this cannot be skipped by accident.
3. Evidence for `access.staging`: the first green Deploy staging run with "Staging access boundary"
   passing. An administrator attaches it; nothing here does.

Also changed by the decision: `/api/digest` and the feedback archive sit behind their own bearer tokens
only, as in production. Provider webhooks and health were always exempt.

### 5. `c16-noindex` — noindex on the non-production origin

`withNoindex()` in `lib/environment-gate.ts` sets `X-Robots-Tag: noindex, nofollow` on every
non-production response, and `app/robots.ts` serves `Disallow: /` when `APP_ENV` is not production.

**Closed 12 September 2026.** Confirmed live on the running worker: `X-Robots-Tag: noindex, nofollow`
is present on the storefront in both `development` and `staging`, on the 401 challenge and on the
503 refusal, and absent in production. It does not overwrite a stricter tag a page has already set,
and it preserves the status, headers and body of the response it wraps. Covered by
`tests/environment-gate.test.ts`; asserted after every staging deploy by the workflow step above.

**Corrected 14 September 2026.** "Every non-production response" was not quite true. `worker.ts` hands
hashed `/_next/static/*` bundles straight back to the asset store, without the header. Behind the
password no anonymous request could reach them; on public staging they are fetchable without it (seen
on live staging and on the built worker). They are scripts and stylesheets rather than documents, and
`robots.txt` disallows the whole origin, so this is recorded, not changed. Every page, API answer,
redirect and public file — the favicon, product images — does carry it, and the deploy now asserts it on
nine paths (#4).

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

**Revised 14 September 2026 for open mode (#4).** The storefront is public by the owner's decision, so its
static files are public too, and the table above is now true of closed mode only. `run_worker_first`
stays, for two reasons: public files such as the favicon and product images still pass through the
worker, which is how they get `X-Robots-Tag: noindex` (the deploy checks `/favicon.svg`); and if staging
is ever closed again, the gate covers the files the day it closes, with no second change.

### 11. `c16-1102` — cold-asset waterfall

148 requests per page, 36 chunks of ~19KB each stalling 21–23s, 78s to interactive on a cold load.
Precondition for the cutover.

> **The 78 seconds were withdrawn.** The parent register's Correction 5 retracts this item's headline
> number: measured again with `curl` from a second vantage, the document arrives in 2.2s cold and
> 1.2s warm, and all 36 chunks complete concurrently in 2.07s wall time. The stall was the networking
> path of the browser pane it was first measured in, not the site. What still stands there: the
> 11 September 1102 errors are Worker CPU and the plan should be confirmed (#12), a 1–2s server
> render on product pages is worth trimming, and 36 chunks is a modest optimisation rather than a
> blocker. So this item is no longer a cutover precondition.
>
> The work below was done before that correction was read, and it stands on its own evidence: the
> eleven RSC prefetch renders are a separate finding, measured from the worker's own request log
> rather than from a browser's timings, and each one is server CPU on the Worker — which is the
> thing Correction 5 says *is* real. Treat the request-count improvements as verified and the
> "78s → x" framing as withdrawn.

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

**Still to do:** re-measure on the deployed staging worker (public since 14 September, so no credentials are needed) — from two
vantages, per the rule the parent register adopted after Correction 5: no performance finding enters
the register from a single vantage. What to look for is Worker CPU per page, not wall-clock in a
browser pane.

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
- **Staging access** — setting the secret, and proving the restriction from outside. *(14 September
  2026: rewritten in the generator for public staging — prove the boundary instead. The .docx has not
  been regenerated; see #4.)*
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

### 18. `c16-new-2` — there is no Cloudflare API token in the repository

**Found 12 September 2026** by merging and watching the run. The Deploy staging job printed:

```
env:
  CLOUDFLARE_API_TOKEN:
  CLOUDFLARE_ACCOUNT_ID: ***
✘ [ERROR] In a non-interactive environment, it's necessary to set a CLOUDFLARE_API_TOKEN
  environment variable for wrangler to work.
```

`gh secret list` confirms it: the repository has `CLOUDFLARE_ACCOUNT_ID` and the `STAGING_URL`
variable, and **no `CLOUDFLARE_API_TOKEN` at all**.

Consequences, all of which were invisible until something actually tried to deploy:

- `deploy-staging.yml` has never been able to migrate or deploy. Whatever is running on staging was
  put there by hand from a laptop, which is the deploy path this chapter is trying to retire.
- `deploy-production.yml` would fail in exactly the same place. The v\* tag path is correct and
  proven in every other respect, and it cannot authenticate.
- It is almost certainly the **same cause as the backup rehearsal's Cloudflare error 10000** (#6).
  Two separate items blamed on "auth", one missing secret.

**Owner action**, and not one Claude can do: creating an API token means handling a credential.

1. Cloudflare dashboard → My Profile → API Tokens → Create Token → Custom token, scoped to the
   account holding `nexphase-labs` and `nexphase-labs-staging`, with **Account · D1 · Edit**,
   **Account · Workers R2 Storage · Edit**, and **Account · Workers Scripts · Edit**.
2. Add it as the repository secret — `gh secret set CLOUDFLARE_API_TOKEN` will prompt for the value,
   or use GitHub → Settings → Secrets and variables → Actions.
3. Re-run the failed job: `gh run rerun 34736986650`.
4. Export the same token in the shell for the recovery rehearsal (#6), or make a second one scoped
   the same way.

Record it in `docs/operations/CREDENTIAL_LOCATIONS.md` once it exists — that file already names the
scopes and says where it belongs.

## Change log

- **2026-09-14 (public staging)** — Reconciled `c16-protect`, `c16-new-1` and `access.staging` with the
  owner's decision to make staging public (order 1 of Ammre's completion register). The decision was
  live but undeclared — `STAGING_ACCESS_OPEN` was a Worker secret — and the deploy's last step would
  have failed it. Declared the mode in `wrangler.jsonc`; replaced the last step with
  `scripts/staging-access-check.mjs`, which proves the public/private boundary for the declared mode;
  refused the secret before migrations; revised the control's wording and replaced its stale note in
  staging D1 by an append-only correction; corrected the operator documents. Proven against live
  staging and the built worker in both modes. `c16-protect` is built, unproven in the deploy job until
  #18. Recorded the `/_next/static` noindex exception under #5. Test count 684 → 700.
- **2026-09-12 (merged)** — Merged the launch branch to `main` on the owner's instruction and
  watched the run. It failed at Apply migrations and surfaced `c16-new-2`: the repository has no
  `CLOUDFLARE_API_TOKEN`, so neither deploy workflow has ever been able to authenticate. Nothing was
  applied or deployed; staging is unchanged. `c16-merge` stays open behind it.
- **2026-09-12 (parent register read)** — Pulled the parent (artifact `997fc7b6…`, Rev. 7) and
  applied its Correction 5 to #11: the 78-second cold load was an artifact of the measuring tool and
  is withdrawn, so #11 is no longer a cutover precondition. The eleven-prefetch finding recorded
  below is independent of it and stands. Chapter index added at the top of this file.
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
