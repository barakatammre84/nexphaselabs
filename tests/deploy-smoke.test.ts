import { execFile } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { promisify } from 'node:util';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/**
 * The smoke test at the end of both deploy jobs. Healthy on its own proves nothing about the
 * release: the worker a deploy replaces answers `ok` too, so a deploy that never took effect
 * would pass. The step must wait until /api/health names the commit the job built.
 *
 * These tests lift the step's shell out of the workflow file and run it with bash against a
 * stand-in health endpoint, so what is tested is exactly what the job runs.
 */

const run = promisify(execFile);
let answer = '';
let server: Server;
let origin = '';

beforeAll(async () => {
  server = createServer((_request, response) => {
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end(answer);
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

function smokeScript(file: string): string {
  const steps = readFileSync(file, 'utf8').split(/\n {6}- /).slice(1);
  const step = steps.find((text) => text.startsWith('name: Smoke test'));
  if (!step) throw new Error(`${file} has no smoke test step`);
  const lines = step.split('\n');
  const start = lines.findIndex((line) => line.trim() === 'run: |');
  return lines
    .slice(start + 1)
    .filter((line) => line.startsWith(' '.repeat(10)) || line.trim() === '')
    .map((line) => line.slice(10))
    .join('\n');
}

async function smoke(file: string, urlVariable: string, built: string) {
  // The real step sleeps ten seconds between attempts; the stand-in answers at once.
  const script = `sleep() { :; }\n${smokeScript(file)}`;
  try {
    await run('bash', ['-c', script], { env: { ...process.env, [urlVariable]: origin, GITHUB_SHA: built } });
    return 0;
  } catch (error) {
    return (error as { code?: number }).code ?? 1;
  }
}

const built = 'a'.repeat(40);
const replaced = 'b'.repeat(40);

describe.each([
  { file: '.github/workflows/deploy-staging.yml', urlVariable: 'STAGING_URL', env: 'staging' },
  { file: '.github/workflows/deploy-production.yml', urlVariable: 'PRODUCTION_SMOKE_URL', env: 'production' },
])('$file smoke test', ({ file, urlVariable, env }) => {
  it('passes once the health report names the commit this job built', async () => {
    answer = JSON.stringify({ ok: true, db: 'ok', docs: 'ok', env, release: built, at: 'now' });
    expect(await smoke(file, urlVariable, built)).toBe(0);
  });

  it('fails while the worker the deploy replaced is still answering', async () => {
    answer = JSON.stringify({ ok: true, db: 'ok', docs: 'ok', env, release: replaced, at: 'now' });
    expect(await smoke(file, urlVariable, built)).not.toBe(0);
  });

  it('fails an older worker that reports no release at all', async () => {
    answer = JSON.stringify({ ok: true, db: 'ok', docs: 'ok', env, at: 'now' });
    expect(await smoke(file, urlVariable, built)).not.toBe(0);
  });

  it('fails an unhealthy worker even on the right commit', async () => {
    answer = JSON.stringify({ ok: false, db: 'error', docs: 'ok', env, release: built, at: 'now' });
    expect(await smoke(file, urlVariable, built)).not.toBe(0);
  });
});

describe('the release the smoke test waits for', () => {
  it('is written into the bundle from the CI commit', () => {
    expect(readFileSync('vite.config.ts', 'utf8')).toContain('process.env.GITHUB_SHA');
  });
});
