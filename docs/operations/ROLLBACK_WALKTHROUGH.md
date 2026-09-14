# Rollback walkthrough — for the second person

Status: rehearsal script for `c16-secondpair`. Wisam runs it on **staging**, Ammre watches and says
nothing unless something is genuinely wrong. It takes about twenty minutes.

This does not make anyone a platform engineer. It makes the difference between a bad week and an
unrecoverable one: after it, someone other than Ammre has typed the commands that put the site back,
has seen what a healthy answer looks like, and knows where to look when the answer is not healthy.

Do it before the cutover. After the domain moves, the first time we need this will be the first time
we find out whether anybody else can do it.

## Before you start

You need, in your own name — not shared, not borrowed:

- A Cloudflare account login with access to the NexPhase account.
- The repository checked out, `npm ci` run, and `npx wrangler whoami` naming the right account.
- A staging staff account in your own name for checking protected tools.
- A terminal, and Ammre next to you or on a call.

If any of those is missing, stop and fix that first. Discovering it during an incident is the thing
this rehearsal exists to prevent.

## 1. See where staging is now

```bash
npx wrangler deployments list --env staging
```

Read the top entry aloud: its id, when it was created, and who authored it. That is what is serving
staging right now. Write the id down — it is what you will be coming back to.

```bash
curl -s -o /dev/null -w '%{http_code}\n' https://<staging-host>/          # expect 200
curl -sI https://<staging-host>/ | grep -i x-robots-tag                    # expect noindex
curl -sI https://<staging-host>/manage | grep -i '^location: /staff/sign-in'
curl -fsS https://<staging-host>/api/health                                # expect "ok":true
```

Public staging is intentionally open for review and unindexable. The staff redirect proves its
private tools still require the application's own sign-in. The health endpoint is public so you can
check it without signing in.

## 2. Put a change on staging

Ammre pushes a visible, harmless change to `main` — a word on the home page. Watch the workflow:

```bash
gh run watch
```

Read the steps as they pass. The three that matter: **Deploy guard**, which refuses a build that
does not target staging; **Apply migrations**; and **Verify the approved staging public/private
boundary**, which checks public access, noindex, staff sign-in, and private API authentication.

Sign in with your staging staff account and confirm you can see the change.

## 3. Roll it back

This is the part you are here for.

```bash
npx wrangler deployments list --env staging          # note the id of the entry you wrote down
npx wrangler rollback <that-id> --env staging --message "Rollback rehearsal, <today's date>"
```

Wrangler asks you to confirm and tells you what it is about to do. Read it before answering. It
replaces the running worker with that earlier version; it does **not** touch the database.

## 4. Prove it

```bash
curl -fsS https://<staging-host>/api/health
npx wrangler deployments list --env staging          # the top entry is the rollback
```

Sign in to staging again and confirm the change from step 2 is gone. Rolling back without checking
is not a rollback; it is a hope.

## 5. Say what you would do next

Out loud, to Ammre, without looking anything up:

- Where would you look to find out *why* the deploy was bad? (`npx wrangler tail`, then the
  Cloudflare dashboard's worker logs.)
- What does a rollback **not** fix? (Anything the database has already been told. Migrations are
  written to be backward compatible, so the older worker keeps running — but if the data itself is
  wrong, this is an incident, not a rollback, and the administrator decides.)
- Who do you tell? (Open an operational case with the deployment id, the reason, and what health
  said afterwards.)

## 6. Record it

Open an operational case of type `incident`, titled "Rollback rehearsal", with:

- who performed it and who watched,
- the deployment ids before and after,
- what health returned,
- anything that was confusing, missing, or wrong in this document — **especially that**. If a step
  did not work as written, fix this file before closing the case.

Then link the case against the `continuity.incident` operating control. A control is not ready
without an owner and evidence, and this is the evidence.

## What is deliberately not here

Production. Nobody rehearses on production. When a production rollback is genuinely needed, the
commands are in MAN-002 §"Roll back" and the administrator approves it first.
