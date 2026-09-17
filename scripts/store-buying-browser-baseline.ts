import { existsSync } from 'node:fs';
import {
  runStoreBuyingBrowserBaseline,
  type StoreBuyingBrowserOptions,
} from '../lib/store-buying-browser-baseline';

const args = process.argv.slice(2);
const origin = valueOf('--base-url');
const json = args.includes('--json');
const headed = args.includes('--headed');
const timeoutValue = Number(valueOf('--timeout-ms') ?? '15000');
const email = process.env.STAGING_BUYING_BASELINE_EMAIL?.trim();
const password = process.env.STAGING_BUYING_BASELINE_PASSWORD;

if (!origin) fail('Pass --base-url with the exact staging origin to check.');
if (!Number.isInteger(timeoutValue) || timeoutValue < 1000) {
  fail('--timeout-ms must be an integer of at least 1000.');
}

const parsedOrigin = new URL(origin);
if (parsedOrigin.protocol !== 'https:') {
  fail('The staging browser rehearsal requires an https URL.');
}

const executablePath =
  process.env.BROWSER_EXECUTABLE_PATH?.trim() ?? findChromium();

const report = await runStoreBuyingBrowserBaseline({
  origin: parsedOrigin.origin,
  email,
  password,
  timeoutMs: timeoutValue,
  headed,
  executablePath,
} satisfies StoreBuyingBrowserOptions);

if (json) {
  console.log(JSON.stringify(report, null, 2));
} else {
  console.log(`\nStore buying-flow browser baseline — ${report.origin}`);
  console.log(`Environment: staging · ${report.checkedAt}`);
  for (const check of report.checks) {
    console.log(
      `  ${check.ok ? 'PASS' : 'FAIL'} ${check.name.padEnd(32)} ${check.detail}`,
    );
  }
  console.log(
    `  Network mutations observed: ${report.network.observedMutations.length}`,
  );
  console.log(
    report.ok
      ? '\nStaging browser baseline passed. The test quote/payment boundary was reached without an order, payment, email, or label request.'
      : '\nStaging browser baseline failed. Use the environment and route in each failed check to identify the staging customer path that needs attention.',
  );
}

process.exitCode = report.ok ? 0 : 1;

function valueOf(flag: string): string | undefined {
  const index = args.indexOf(flag);
  return index === -1 ? undefined : args[index + 1];
}

function findChromium(): string | undefined {
  const candidates = [
    '/repl/tools/bin/chromium',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/opt/google/chrome/google-chrome',
  ];
  return candidates.find((candidate) => existsSync(candidate));
}

function fail(message: string): never {
  console.error(`Store buying-flow browser baseline: ${message}`);
  process.exit(2);
}
