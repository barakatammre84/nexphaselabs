import { execFile } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { gateNonProduction, withNoindex } from '@/lib/environment-gate';
import { legacyDecision, legacyResponse } from '@/lib/legacy-redirects';
import { PRIVATE_APIS, PUBLIC_PATHS, STAFF_PAGES } from '@/scripts/lib/staging-access.mjs';

/**
 * scripts/cutover-verify.ts on a staging origin. Until 14 September 2026 it
 * demanded that every deployed non-production origin answer an anonymous GET /
 * with 401, so once the owner made staging public it reported correct behaviour
 * as a blocker — and it never asked whether the staff area and the private APIs
 * still refused a stranger. It now proves the staging deploy's own boundary
 * (scripts/lib/staging-access.mjs) in the mode the build declares, and leaves
 * the live domain's rules as they were.
 *
 * These tests run the real script as a child process against a stand-in worker —
 * the real gate from lib/environment-gate.ts and the real old-URL decisions from
 * lib/legacy-redirects.ts, in worker.ts's order, in front of a stand-in
 * application — and read its --json report.
 */

const execute = promisify(execFile);
const dir = mkdtempSync(join(tmpdir(), 'cutover-verify-'));
const BOUNDARY = [...PUBLIC_PATHS, ...STAFF_PAGES, ...PRIVATE_APIS];

type Check = { name: string; ok: boolean; detail: string; severity: 'blocker' | 'warning' };
type Site = {
  environment: 'staging' | 'production';
  open?: boolean;
  password?: string;
  changed?: Record<string, () => Response>;
};

let site: Site = { environment: 'staging' };
/** Every request the access check made, marked if it carried credentials. */
let probed: string[] = [];

const server = createServer(async (incoming, outgoing) => {
  const headers = new Headers();
  for (const [name, value] of Object.entries(incoming.headers)) {
    if (typeof value === 'string') headers.set(name, value);
  }
  if (headers.get('user-agent') === 'nexphase-staging-access-check') {
    probed.push(`${incoming.url}${headers.has('authorization') ? ' with credentials' : ''}`);
  }
  const response = worker(new Request(`http://${incoming.headers.host}${incoming.url}`, { headers }));
  outgoing.writeHead(response.status, Object.fromEntries(response.headers));
  outgoing.end(Buffer.from(await response.arrayBuffer()));
});
let origin = '';

beforeAll(async () => {
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

/** A worker in the order worker.ts runs one: the gate, the old-URL decisions, the application, noindex. */
function worker(request: Request): Response {
  const gate = gateNonProduction(request, site.environment, site.password, site.open ? 'true' : undefined);
  if (gate) return gate;
  const { pathname } = new URL(request.url);
  const legacy = legacyDecision(pathname);
  if (legacy) return legacyResponse(legacy, request.url);
  return withNoindex(site.changed?.[pathname]?.() ?? application(pathname), site.environment);
}

/** The application behind the gate, answering as each environment should. */
function application(pathname: string): Response {
  const production = site.environment === 'production';
  if (pathname === '/api/health') return Response.json({ ok: true, env: site.environment });
  if (pathname === '/robots.txt') {
    return new Response(
      production
        ? 'User-agent: *\nDisallow: /manage\nDisallow: /staff\nDisallow: /api\nDisallow: /account\nSitemap: https://nexphaselabs.net/sitemap.xml\n'
        : 'User-agent: *\nDisallow: /\n',
    );
  }
  if (pathname === '/sitemap.xml') {
    return production
      ? new Response('<urlset><url><loc>https://nexphaselabs.net/catalog</loc></url></urlset>')
      : new Response('Not found', { status: 404 });
  }
  // Decided against the catalog by app/product/[slug]/route.ts; gone is one of the two right answers.
  if (pathname.startsWith('/product/')) return new Response('Gone', { status: 410 });
  if (pathname.startsWith('/manage')) {
    return new Response(null, {
      status: 307,
      headers: { Location: `/staff/sign-in?return_to=${encodeURIComponent(pathname)}` },
    });
  }
  if (pathname.startsWith('/api/manage/') || pathname.startsWith('/api/orders/')) {
    return new Response('Unauthorized', { status: 401 });
  }
  return new Response('<!doctype html><title>NexPhase Labs</title>', {
    headers: { 'Content-Type': 'text/html' },
  });
}

let builds = 0;
/** A built configuration, as `CLOUDFLARE_ENV=staging npm run build` leaves one in dist/server/wrangler.json. */
function build(vars: Record<string, string> = {}): string {
  const path = join(dir, `wrangler-${++builds}.json`);
  writeFileSync(path, JSON.stringify({ name: 'nexphaselabs-staging', vars: { APP_ENV: 'staging', ...vars } }));
  return path;
}
const openBuild = () => build({ STAGING_ACCESS_OPEN: 'true' });
const noBuild = () => join(dir, 'never-built.json');

/** Run the script against the stand-in and read its --json report, whatever it exits with. */
async function verify(...args: string[]): Promise<{ code: number; checks: Check[] }> {
  const run = ['--import', 'tsx', 'scripts/cutover-verify.ts', origin, '--json', ...args];
  const { code, stdout, stderr } = await execute(process.execPath, run, { encoding: 'utf8' }).then(
    ({ stdout, stderr }) => ({ code: 0, stdout, stderr }),
    (failure: { code: number; stdout: string; stderr: string }) => failure,
  );
  try {
    return { code, checks: JSON.parse(stdout).checks };
  } catch {
    throw new Error(`cutover-verify exited ${code} without a report:\n${stdout}${stderr}`);
  }
}

function named(checks: Check[], name: string): Check {
  const found = checks.find((check) => check.name === name);
  if (!found) throw new Error(`no ${name} check among: ${checks.map((check) => check.name).join(', ')}`);
  return found;
}

const blockers = (checks: Check[]) => checks.filter((check) => !check.ok && check.severity === 'blocker');

describe('cutover-verify on a staging origin', { timeout: 60_000 }, () => {
  it('passes public staging with no blockers, proving the deploy check’s boundary instead of demanding a 401', async () => {
    site = { environment: 'staging', open: true };
    probed = [];
    const { code, checks } = await verify('--config', openBuild());
    expect(blockers(checks)).toEqual([]);
    expect(code).toBe(0);
    expect(checks.map((check) => check.name)).not.toContain('closed');
    expect(named(checks, 'access')).toMatchObject({ ok: true, severity: 'blocker' });
    expect(named(checks, 'access').detail).toContain('open mode — STAGING_ACCESS_OPEN is "true"');
    // the deploy check's own paths, in its order, each asked once and anonymously
    expect(probed).toEqual(BOUNDARY);
  });

  it('fails public staging when a staff page or a private API answers a stranger', async () => {
    for (const path of ['/manage/orders', '/api/manage/reports/orders.csv']) {
      site = { environment: 'staging', open: true, changed: { [path]: () => new Response('Order,Customer,Email\n') } };
      const { code, checks } = await verify('--config', openBuild());
      expect(code, path).toBe(1);
      expect(named(checks, 'access')).toMatchObject({ ok: false, severity: 'blocker' });
      expect(named(checks, 'access').detail).toContain(`${path}: 200 — served to a request with no login`);
    }
  });

  it('passes closed staging on the password challenge, asking the boundary anonymously even when given --user', async () => {
    site = { environment: 'staging', password: 'correct horse' };
    probed = [];
    const { code, checks } = await verify('--config', build(), '--user', 'tester:correct horse');
    expect(blockers(checks)).toEqual([]);
    expect(code).toBe(0);
    expect(named(checks, 'access').detail).toContain('closed mode — STAGING_ACCESS_OPEN is not declared');
    expect(probed).toEqual(BOUNDARY);
  });

  it('fails 16.3 — open to strangers while the build declares nothing — because the mode is read from the build', async () => {
    site = { environment: 'staging', open: true };
    const { code, checks } = await verify('--config', build());
    expect(code).toBe(1);
    expect(named(checks, 'access').ok).toBe(false);
    expect(named(checks, 'access').detail).toContain('staging is OPEN');
  });

  it('refuses to guess the mode when there is no staging build to read it from', async () => {
    site = { environment: 'staging', open: true };
    for (const config of [noBuild(), build({ APP_ENV: 'production' })]) {
      const { code, checks } = await verify('--config', config);
      expect(code, config).toBe(1);
      expect(named(checks, 'access')).toMatchObject({ ok: false, severity: 'blocker' });
      expect(named(checks, 'access').detail).toContain(config);
      expect(named(checks, 'access').detail).toContain('never inferred');
    }
  });
});

describe('cutover-verify on the live domain', { timeout: 60_000 }, () => {
  it('keeps production’s rules: indexable, with no staging boundary or build to read', async () => {
    site = { environment: 'production' };
    const { code, checks } = await verify('--config', noBuild());
    expect(blockers(checks)).toEqual([]);
    expect(code).toBe(0);
    expect(named(checks, 'indexable').ok).toBe(true);
    expect(checks.map((check) => check.name)).not.toContain('access');
  });

  it('still fails a live domain that tells crawlers noindex', async () => {
    site = {
      environment: 'production',
      changed: { '/': () => new Response('<!doctype html>', { headers: { 'X-Robots-Tag': 'noindex' } }) },
    };
    const { code, checks } = await verify('--config', noBuild());
    expect(code).toBe(1);
    expect(named(checks, 'indexable')).toMatchObject({ ok: false, severity: 'blocker' });
  });
});
