#!/usr/bin/env node
/**
 * Run the deployed staging worker's synthetic refund rehearsal.
 *
 * This sends one same-origin POST with no cookies, credentials, payment
 * details, or provider calls. The worker creates and removes its own fixture.
 */
const [originArgument, expectedRelease = process.env.GITHUB_SHA] = process.argv.slice(2);

let origin;
try {
  origin = new URL(originArgument);
} catch {
  console.error('staging-refund-rehearsal: pass the staging origin first');
  process.exit(2);
}
if (origin.protocol !== 'https:') {
  console.error(`staging-refund-rehearsal: refusing non-HTTPS origin ${origin.origin}`);
  process.exit(2);
}
if (!expectedRelease) {
  console.error('staging-refund-rehearsal: expected release is missing');
  process.exit(2);
}

const response = await fetch(new URL('/api/staging/refund-rehearsal', origin), {
  method: 'POST',
  headers: {
    Origin: origin.origin,
    'x-staging-refund-rehearsal-release': expectedRelease,
  },
});
const text = await response.text();
let report;
try {
  report = JSON.parse(text);
} catch {
  console.error(`staging-refund-rehearsal: worker returned non-JSON (${response.status})`);
  console.error(text.slice(0, 500));
  process.exit(1);
}

console.log(JSON.stringify(report, null, 2));
if (!response.ok || report.ok !== true || report.release !== expectedRelease) {
  console.error(
    `staging-refund-rehearsal: failed for ${origin.origin} on ${expectedRelease}`,
  );
  process.exit(1);
}
console.error(`staging-refund-rehearsal: passed on ${expectedRelease}`);