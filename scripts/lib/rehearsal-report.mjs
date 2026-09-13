/**
 * Verdict and report for a recovery rehearsal. Pure functions, no IO, so the
 * rules that decide whether a rehearsal passed can be tested without credentials
 * (tests/recovery-rehearsal.test.ts).
 *
 * The rule that matters: a rehearsal with a skipped half is INCOMPLETE, not
 * passed. A database restored without its documents is not a recovery, and a
 * recovery nobody timed is a guess.
 */

/** @typedef {{ name: string, status: 'passed'|'failed'|'skipped', ms: number, detail?: Record<string, unknown>, reason?: string }} Phase */
/** @typedef {{ key: string, size: number, etag?: string }} ObjectRecord */

export function formatDuration(ms) {
  if (!Number.isFinite(ms) || ms < 0) return 'unknown';
  const totalSeconds = Math.round(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes === 0) return `${seconds}s`;
  const hours = Math.floor(minutes / 60);
  if (hours === 0) return `${minutes}m ${seconds}s`;
  return `${hours}h ${minutes % 60}m ${seconds}s`;
}

/**
 * Compare what was in the source bucket with what came back out of the isolated
 * restore. Keys and bytes must match; an ETag is compared only when both sides
 * report one, because R2 omits it for multipart objects.
 * @param {ObjectRecord[]} source
 * @param {ObjectRecord[]} restored
 */
export function objectManifestDiff(source, restored) {
  const restoredByKey = new Map(restored.map((item) => [item.key, item]));
  const sourceByKey = new Map(source.map((item) => [item.key, item]));
  const missing = source.filter((item) => !restoredByKey.has(item.key)).map((item) => item.key);
  const extra = restored.filter((item) => !sourceByKey.has(item.key)).map((item) => item.key);
  const byteMismatches = [];
  const checksumMismatches = [];
  for (const item of source) {
    const other = restoredByKey.get(item.key);
    if (!other) continue;
    if (other.size !== item.size) {
      byteMismatches.push({ key: item.key, source: item.size, restored: other.size });
    }
    if (item.etag && other.etag && normaliseEtag(item.etag) !== normaliseEtag(other.etag)) {
      checksumMismatches.push({ key: item.key, source: item.etag, restored: other.etag });
    }
  }
  return {
    ok: missing.length === 0 && extra.length === 0 && byteMismatches.length === 0 && checksumMismatches.length === 0,
    sourceCount: source.length,
    restoredCount: restored.length,
    sourceBytes: source.reduce((total, item) => total + item.size, 0),
    restoredBytes: restored.reduce((total, item) => total + item.size, 0),
    missing,
    extra,
    byteMismatches,
    checksumMismatches,
  };
}

function normaliseEtag(value) {
  return String(value).replaceAll('"', '').trim();
}

/**
 * A rehearsal passes only when every required phase passed. Skipping a phase —
 * no R2 credentials, for instance — leaves it incomplete: the continuity control
 * stays open and nobody may record it as ready.
 * @param {{ phases: Phase[] }} record
 */
export function rehearsalVerdict(record) {
  const phases = record.phases ?? [];
  const failed = phases.filter((phase) => phase.status === 'failed');
  const skipped = phases.filter((phase) => phase.status === 'skipped');
  if (failed.length > 0) {
    return {
      status: 'failed',
      reasons: failed.map((phase) => `${phase.name} failed${phase.reason ? `: ${phase.reason}` : ''}`),
    };
  }
  if (skipped.length > 0) {
    return {
      status: 'incomplete',
      reasons: skipped.map((phase) => `${phase.name} was not attempted${phase.reason ? `: ${phase.reason}` : ''}`),
    };
  }
  if (phases.length === 0) {
    return { status: 'incomplete', reasons: ['nothing ran'] };
  }
  return { status: 'passed', reasons: [] };
}

const VERDICT_SENTENCE = {
  passed: 'Every required phase passed. The elapsed time below is the measured recovery time for this data volume.',
  incomplete: 'This rehearsal is INCOMPLETE. It is not evidence for the continuity control and the control stays open.',
  failed: 'This rehearsal FAILED. Open an incident case, preserve the output, and do not overwrite the failed backup.',
};

/** Human-readable record, written beside the machine-readable one. */
export function renderReport(record) {
  const verdict = rehearsalVerdict(record);
  const total = record.phases.reduce((sum, phase) => sum + (phase.ms || 0), 0);
  const lines = [
    `# Recovery rehearsal — ${record.environment} — ${record.startedAt}`,
    '',
    `**Verdict: ${verdict.status.toUpperCase()}**`,
    '',
    VERDICT_SENTENCE[verdict.status],
    '',
  ];
  if (verdict.reasons.length > 0) {
    for (const reason of verdict.reasons) lines.push(`- ${reason}`);
    lines.push('');
  }
  lines.push(
    `- Operator: ${record.operator}`,
    `- Environment: ${record.environment} (database \`${record.database}\`, bucket \`${record.bucket}\`)`,
    `- Started: ${record.startedAt}`,
    `- Finished: ${record.finishedAt}`,
    `- **Elapsed, export to verified restore: ${formatDuration(total)}**`,
    '',
    '## Phases',
    '',
    '| Phase | Result | Elapsed |',
    '| --- | --- | --- |',
  );
  for (const phase of record.phases) {
    lines.push(`| ${phase.name} | ${phase.status}${phase.reason ? ` — ${phase.reason}` : ''} | ${formatDuration(phase.ms)} |`);
  }
  lines.push('', '## What was checked', '');
  for (const phase of record.phases) {
    if (!phase.detail) continue;
    lines.push(`### ${phase.name}`, '', '```json', JSON.stringify(phase.detail, null, 2), '```', '');
  }
  lines.push(
    '## Recovery time',
    '',
    `Measured: **${formatDuration(total)}** for ${record.dataSummary ?? 'the data present at the time of the rehearsal'}.`,
    'Recovery time grows with the data; re-measure when the database or document store grows materially.',
    'Record this number against the owner-approved recovery target — an unmeasured objective is a guess.',
    '',
    '## Witness and business acceptance',
    '',
    'The technology seat performs; Quality or Operations witnesses the result and records business',
    'acceptance (docs/THREE_PERSON_OPERATING_MODEL_2026-09-09.md, "Deployment and recovery").',
    '',
    '| Field | Entry |',
    '| --- | --- |',
    '| Witness name and role | |',
    '| Witnessed on (date) | |',
    '| Recovery time accepted as the objective? | |',
    '| Exceptions accepted, or case opened | |',
    '| Evidence folder | |',
    '',
    'Once signed, link this file against the `continuity.backup` operating control. A control cannot be',
    'marked ready without an owner and evidence.',
    '',
  );
  return lines.join('\n');
}
