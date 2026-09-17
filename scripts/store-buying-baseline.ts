import {
  runStoreBuyingBaseline,
  type StoreBaselineEnvironment,
} from '../lib/store-buying-baseline';

const args = process.argv.slice(2);
const json = args.includes('--json');
const origin = valueOf('--base-url');
const environment = valueOf('--environment') as
  | StoreBaselineEnvironment
  | undefined;
const accountRequired = !args.includes('--anonymous-pricing');
const timeoutValue = Number(valueOf('--timeout-ms') ?? '15000');

const environments: StoreBaselineEnvironment[] = [
  'production',
  'staging',
  'development',
  'local',
];

if (!origin) fail('Pass --base-url with the exact origin to check.');
if (!environment || !environments.includes(environment)) {
  fail(`Pass --environment as one of: ${environments.join(', ')}.`);
}

if (!Number.isInteger(timeoutValue) || timeoutValue < 1000) {
  fail('--timeout-ms must be an integer of at least 1000.');
}

const parsedOrigin = new URL(origin);
if (environment === 'production' && parsedOrigin.protocol !== 'https:') {
  fail('Production baselines require an https URL.');
}

const report = await runStoreBuyingBaseline({
  origin: parsedOrigin.origin,
  environment,
  accountRequired,
  timeoutMs: timeoutValue,
});

if (json) {
  console.log(JSON.stringify(report, null, 2));
} else {
  console.log(`\nStore buying-flow baseline — ${report.origin}`);
  console.log(
    `Environment: ${report.environment} · Read-only: yes · ${report.checkedAt}`,
  );
  console.log(
    accountRequired
      ? 'Anonymous pricing posture: account required'
      : 'Anonymous pricing posture: enabled by explicit flag',
  );
  for (const check of report.checks) {
    console.log(
      `  ${check.ok ? 'PASS' : 'FAIL'} ${check.name.padEnd(30)} ${check.detail}`,
    );
  }
  console.log(
    report.ok
      ? '\nBaseline passed. No forms, orders, messages, labels, or payments were submitted.'
      : '\nBaseline failed. Fix or record the route-specific failures before comparing a bug fix.',
  );
}

process.exitCode = report.ok ? 0 : 1;

function valueOf(flag: string): string | undefined {
  const index = args.indexOf(flag);
  return index === -1 ? undefined : args[index + 1];
}

function fail(message: string): never {
  console.error(`Store buying-flow baseline: ${message}`);
  process.exit(2);
}
