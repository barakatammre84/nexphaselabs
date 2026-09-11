# Backup and restore rehearsal

Status: controlled technical runbook; a successful rehearsal must still be recorded in the operating-control register.

## Purpose and scope

Prove that the NexPhase operational database can be exported, kept with an integrity manifest, restored into an isolated database, and queried without changing staging or production. R2 document recovery is a separate required step because a valid database without its private evidence files is not a complete recovery.

## Authority and safety rules

- Ammre is the technical operator. An administrator records the evidence link and readiness decision.
- Rehearse on staging first. Never import a backup into the live production database during a rehearsal.
- Use an encrypted, access-controlled directory outside the source repository. Never commit exports, customer records, credentials, or manifests.
- Schedule production export as a maintenance action because Cloudflare notes that an export can temporarily make a larger D1 database unavailable.
- Record start/end time, operator, source environment, output checksum, restore result, R2 result, exceptions, and reviewer.

## D1 database procedure

1. Create a dedicated encrypted backup directory with access limited to the operator and approved reviewer.
2. From the application repository, run `node scripts/d1-backup.mjs staging /absolute/private/backup-directory`.
3. Confirm that both the SQL file and its `.manifest.json` file exist and are non-empty. Do not open the SQL in shared tools; it can contain customer and operational data.
4. Run `node scripts/d1-restore-verify.mjs /absolute/private/backup-directory/export-name.sql`.
5. Accept the database step only when the result says `ok: true`, required operational tables are present, integrity is `ok`, and foreign-key violations are empty.
6. Store the terminal result and manifest in the restricted recovery evidence folder. Link that folder to the “Backup and restore rehearsed” operating control.

For a production export, use the same command with `production` and set `NEXPHASE_CONFIRM_PRODUCTION_BACKUP=yes` only for the approved maintenance window. The confirmation does not authorize a restore or any production mutation.

## R2 document procedure

1. Use approved R2 S3 credentials with read-only access to the selected environment bucket.
2. Copy the complete bucket to the dated encrypted recovery directory with an S3-compatible tool that preserves object keys and metadata. Staging is `nexphase-documents-staging`; production is `nexphase-documents`.
3. Save an object manifest containing key, byte size, checksum/ETag where available, and completion time.
4. Restore the copy into a newly created isolated rehearsal bucket, never the source bucket.
5. Compare object count and total bytes. Sample at least one product image, one lot document, one organization document, and one issued order document when each type exists; compare bytes or cryptographic checksum.
6. Point a disposable local/test Worker binding at the isolated database and isolated bucket. Confirm an authorized staff user can open sampled private documents and that unauthenticated access remains refused.

## Failure and escalation

- Stop if the target environment, bucket, database, or output directory is ambiguous.
- Treat a checksum mismatch, missing object, integrity error, foreign-key violation, incomplete export, or authentication bypass as a critical operational case.
- Preserve output and error text; do not overwrite the failed backup. Open an `incident` case, assign Ammre for technical containment, and assign the administrator for readiness disposition.
- A failed rehearsal leaves the continuity control open. Software health checks alone are not recovery evidence.

## Completion criteria and records

- D1 export and isolated in-memory restore verification pass.
- R2 copy, isolated restore, count/byte comparison, and representative document retrieval pass.
- Recovery duration is recorded against the owner-approved recovery target.
- Exceptions are closed or explicitly accepted by authorized members.
- Evidence link, rehearsal date, operator, reviewer, and next review date are recorded in the operating-control register.

Cloudflare references: [D1 import/export](https://developers.cloudflare.com/d1/best-practices/import-export-data/), [D1 Time Travel](https://developers.cloudflare.com/d1/reference/time-travel/), and [R2 download methods](https://developers.cloudflare.com/r2/objects/download-objects/).
