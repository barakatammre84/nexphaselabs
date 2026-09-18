---
name: Staging migration proof
description: How to interpret staging health and release evidence around Cloudflare D1 migrations
---

The staging `/api/health` check proves the deployed worker can query its expected schema and document binding, but it does not prove that a specific migration has been applied. A healthy worker may still be serving an older release whose D1 migration history predates the pending schema change.

**Why:** The staging worker can report `db: ok` while its release commit is older than the workspace commit containing a new migration. Treating health as migration proof can lead to exercising the wrong worker or claiming an unverified schema.

**How to apply:** Before a staging matrix, match the health `release` to the intended worker commit, confirm that commit contains the migration, and retain the workflow/D1 migration result separately from the health and access-boundary checks.