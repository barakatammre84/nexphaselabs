import { execFile } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { gateNonProduction, withNoindex } from '@/lib/environment-gate';

/**
 * The last step of deploy-staging.yml. On 12 September 2026 staging was open to
 * anyone by accident (16.3); on 14 September the owner opened it on purpose. The
 * check has to tell those apart, so it reads the mode from the built
 * configuration and proves the boundary that mode promises: public pages open and
 * unindexable, staff pages and private APIs still behind their own logins.
 *
 * These tests run the real script as a child process against a stand-in staging
 * worker — the real gate from lib/environment-gate.ts, in front of an application
 * that answers the way the live staging worker answered on 14 September 2026 —
 * and read its exit code.
 */

const execute = promisify(execFile);
const dir = mkdtempSync(join(tmpdir(), 'staging-access-'));

type Worker = (request: Request) => Response;
let staging: Worker = () => new Response('no stand-in configured', { status: 500 });

const server = createServer(async (incoming, outgoing) => {
  const headers = new Headers();
  for (const [name, value] of Object.entries(incoming.headers)) {
    if (typeof value === 'string') headers.set(name, value);
  }
  const response = staging(new Request(`http://${incoming.headers.host}${incoming.url}`, { headers }));
  outgoing.writeHead(response.status, Object.fromEntries(response.headers));
  outgoing.end(Buffer.from(await response.arrayBuffer()));
});
let origin = '';

beforeAll(async () => {
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

/** The application behind the gate, answering an anonymous request as live staging did. */
function application(pathname: string): Response {
  if (pathname.startsWith('/manage')) {
    return new Response(null, {
      status: 307,
      headers: { Location: '/staff/sign-in?return_to=%2Fmanage' },
    });
  }
  if (pathname.startsWith('/api/manage/') || pathname.startsWith('/api/orders/')) {
    return new Response('Unauthorized', { status: 401 });
  }
  return new Response('<!doctype html><title>NexPhase Labs</title>', {
    status: 200,
    headers: { 'Content-Type': 'text/html' },
  });
}

/**
 * A staging worker in the order worker.ts runs it: the gate, the application, then
 * noindex. `changed` replaces the application's answer for one path.
 */
function worker(
  access: { open?: boolean; password?: string },
  changed: Record<string, () => Response> = {},
): Worker {
  return (request) => {
    const gate = gateNonProduction(request, 'staging', access.password, access.open ? 'true' : undefined);
    if (gate) return gate;
    const { pathname } = new URL(request.url);
    const answer = changed[pathname]?.() ?? application(pathname);
    return withNoindex(answer, 'staging');
  };
}

let builds = 0;
/** A built staging configuration, as the deploy job hands it to the check. */
function build(vars: Record<string, string> = {}): string {
  const path = join(dir, `wrangler-${++builds}.json`);
  writeFileSync(
    path,
    JSON.stringify({
      name: 'nexphaselabs-staging',
      targetEnvironment: 'staging',
      vars: {
        APP_ENV: 'staging',
        PUBLIC_ORIGIN: 'https://nexphaselabs-staging.ammre.workers.dev',
        ...vars,
      },
    }),
  );
  return path;
}
const openBuild = () => build({ STAGING_ACCESS_OPEN: 'true' });
const closedBuild = () => build();

async function check(args: string[]): Promise<{ code: number; output: string }> {
  try {
    const { stdout, stderr } = await execute('node', ['scripts/staging-access-check.mjs', ...args], {
      encoding: 'utf8',
    });
    return { code: 0, output: `${stdout}${stderr}` };
  } catch (error) {
    const failure = error as { code: number; stdout: string; stderr: string };
    return { code: failure.code, output: `${failure.stdout}${failure.stderr}` };
  }
}

const page = (body: string, status = 200, headers: Record<string, string> = {}) => () =>
  new Response(body, { status, headers: { 'Content-Type': 'text/html', ...headers } });

describe('staging access boundary check', { timeout: 30_000 }, () => {
  describe('open mode, the owner’s decision of 14 September 2026', () => {
    it('accepts public pages at 200 with noindex while staff pages and private APIs keep their logins', async () => {
      staging = worker({ open: true });
      const result = await check([origin, openBuild()]);
      expect(result.code).toBe(0);
      expect(result.output).toContain('mode open');
      expect(result.output).not.toContain('BAD');
      for (const path of ['/', '/catalog', '/favicon.svg', '/manage/orders', '/api/manage/reports/orders.csv', '/api/orders/NX-00000/invoice']) {
        expect(result.output).toContain(path);
      }
      // the redirect is read, not followed: the sign-in page's own 200 never stands in for /manage
      expect(result.output).toContain('307 → /staff/sign-in?return_to=%2Fmanage · noindex');
    });

    it('waits for a fail-closed old isolate to drain immediately after deployment', async () => {
      let firstRootRequest = true;
      staging = worker(
        { open: true },
        {
          '/': () => {
            if (firstRootRequest) {
              firstRootRequest = false;
              return new Response('Staging access is not configured.', { status: 503 });
            }
            return application('/');
          },
        },
      );
      const result = await check([origin, openBuild()]);
      expect(result.code).toBe(0);
      expect(result.output).not.toContain('BAD');
    });

    it('fails the deploy when a staff page renders for a stranger', async () => {
      staging = worker({ open: true }, { '/manage/orders': page('<table>orders</table>') });
      const result = await check([origin, openBuild()]);
      expect(result.code).toBe(1);
      expect(result.output).toMatch(/BAD staff\s+\/manage\/orders\s+200/);
      expect(result.output).toContain('REFUSING this deploy');
      expect(result.output).toContain('npx wrangler rollback --env staging');
    });

    it('fails the deploy when a private API answers a stranger', async () => {
      staging = worker(
        { open: true },
        { '/api/manage/reports/orders.csv': () => new Response('Order,Customer,Email\n', { status: 200 }) },
      );
      const result = await check([origin, openBuild()]);
      expect(result.code).toBe(1);
      expect(result.output).toMatch(/BAD private\s+\/api\/manage\/reports\/orders\.csv\s+200/);
    });

    it('accepts no redirect from a staff page except to this origin’s staff sign-in', async () => {
      for (const location of ['/', '/account/sign-in', 'https://sign-in.example.com/staff/sign-in']) {
        staging = worker(
          { open: true },
          { '/manage': () => new Response(null, { status: 307, headers: { Location: location } }) },
        );
        expect((await check([origin, openBuild()])).code, `a redirect to ${location}`).toBe(1);
      }
    });

    it('does not take "not found" or an error as proof that a login is required', async () => {
      const changes: Record<string, () => Response>[] = [
        { '/api/orders/NX-00000/invoice': () => new Response('Not found', { status: 404 }) },
        { '/manage/controls': page('error', 500) },
      ];
      for (const changed of changes) {
        staging = worker({ open: true }, changed);
        expect((await check([origin, openBuild()])).code).toBe(1);
      }
    });

    it('fails a public page that is broken, or that has opted back into indexing', async () => {
      staging = worker({ open: true }, { '/catalog': page('error', 500) });
      expect((await check([origin, openBuild()])).code).toBe(1);

      staging = worker({ open: true }, { '/': page('<html></html>', 200, { 'X-Robots-Tag': 'index, follow' }) });
      const indexable = await check([origin, openBuild()]);
      expect(indexable.code).toBe(1);
      expect(indexable.output).toContain('no X-Robots-Tag: noindex');
    });

    it('fails when the configuration says open but the running worker still wants the password', async () => {
      staging = worker({ password: 'correct horse' });
      const result = await check([origin, openBuild()]);
      expect(result.code).toBe(1);
      expect(result.output).toContain('still asks for the password');
    });
  });

  describe('closed mode', () => {
    it('accepts the password challenge in front of every path', async () => {
      staging = worker({ password: 'correct horse' });
      const result = await check([origin, closedBuild()]);
      expect(result.code).toBe(0);
      expect(result.output).toContain('mode closed');
      expect(result.output).not.toContain('BAD');
    });

    it('fails 16.3: a storefront open to strangers that the configuration never declared', async () => {
      // e.g. STAGING_ACCESS_OPEN set as a Worker secret — open, with nothing in the repository saying so
      staging = worker({ open: true });
      const result = await check([origin, closedBuild()]);
      expect(result.code).toBe(1);
      expect(result.output).toContain('staging is OPEN');
      expect(result.output).toContain('never as a Worker secret');
    });

    it('fails a missing password as a broken deploy and names the command that fixes it', async () => {
      staging = worker({});
      const result = await check([origin, closedBuild()]);
      expect(result.code).toBe(1);
      expect(result.output).toContain('npx wrangler secret put STAGING_ACCESS_PASSWORD --env staging');
    });

    it('reads the switch exactly as the gate does: only "true" opens staging', async () => {
      staging = worker({ open: true });
      for (const value of ['TRUE', 'yes', '1', 'false']) {
        const result = await check([origin, build({ STAGING_ACCESS_OPEN: value })]);
        expect(result.code, `STAGING_ACCESS_OPEN=${value}`).toBe(1);
        expect(result.output).toContain('mode closed');
      }
    });
  });

  it('will not run without a staging origin and a staging build', async () => {
    expect((await check([])).code).toBe(2);
    expect((await check(['nexphaselabs-staging.ammre.workers.dev', openBuild()])).code).toBe(2);
    expect((await check([origin, join(dir, 'does-not-exist.json')])).code).toBe(2);
    expect((await check([origin, build({ APP_ENV: 'production' })])).code).toBe(2);
  });

  it('counts a staging origin that does not answer as a failure, not a pass', async () => {
    const vacant = createServer();
    await new Promise<void>((resolve) => vacant.listen(0, '127.0.0.1', resolve));
    const { port } = vacant.address() as AddressInfo;
    await new Promise<void>((resolve) => vacant.close(() => resolve()));
    const result = await check([`http://127.0.0.1:${port}`, openBuild()]);
    expect(result.code).toBe(1);
    expect(result.output).toContain('could not be reached');
  });
});

describe('the staging deploy job', () => {
  const workflow = readFileSync('.github/workflows/deploy-staging.yml', 'utf8');
  const steps = workflow.split(/\n {6}- /).slice(1);
  const step = (fragment: string) => steps.findIndex((text) => text.includes(fragment));

  it('ends with the boundary check, run against the configuration it has just deployed', () => {
    expect(steps.at(-1)).toContain('node scripts/staging-access-check.mjs "$STAGING_URL" dist/server/wrangler.json');
    expect(step('npx wrangler deploy --config dist/server/wrangler.json')).toBeLessThan(steps.length - 1);
    // the pre-decision rule — any answer but 401 fails — must not survive beside it
    expect(workflow).not.toContain('case "$code"');
  });

  it('refuses a Worker secret that would decide the access mode, before the database is touched', () => {
    const refusal = step('npx wrangler secret list --env staging');
    expect(refusal).toBeGreaterThan(-1);
    expect(steps[refusal]).toContain('STAGING_ACCESS_OPEN');
    expect(refusal).toBeLessThan(step('npm run db:migrate:staging'));
  });

  it('deploys a configuration that declares the approved mode for staging, and only for staging', () => {
    const config = readFileSync('wrangler.jsonc', 'utf8');
    const declarations = [...config.matchAll(/"STAGING_ACCESS_OPEN":\s*"true"/g)].map((match) => match.index);
    expect(declarations).toHaveLength(1);
    expect(declarations[0]).toBeGreaterThan(config.indexOf('"staging": {'));
  });
});
