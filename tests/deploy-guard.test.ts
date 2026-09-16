import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';

/**
 * The guard is the only thing standing between a mistyped build and the incident
 * of 9 September 2026, when a deploy labelled "staging" reached production. A
 * guard nobody has watched refuse is a guard nobody knows works, so these tests
 * run the real script as a child process and read its exit code.
 */

const dir = mkdtempSync(join(tmpdir(), 'deploy-guard-'));

const STAGING_BUILD = {
  name: 'nexphaselabs-staging',
  targetEnvironment: 'staging',
  vars: { APP_ENV: 'staging', PUBLIC_ORIGIN: 'https://nexphaselabs-staging.nexphase.workers.dev' },
  d1_databases: [{ database_name: 'nexphase-labs-staging' }],
  r2_buckets: [{ bucket_name: 'nexphase-documents-staging' }],
};

const PRODUCTION_BUILD = {
  name: 'nexphaselabs',
  vars: { APP_ENV: 'production', PUBLIC_ORIGIN: 'https://nexphaselabs.net' },
  d1_databases: [{ database_name: 'nexphase-labs' }],
  r2_buckets: [{ bucket_name: 'nexphase-documents' }],
};

function configFile(name: string, contents: unknown): string {
  const path = join(dir, `${name}.json`);
  writeFileSync(path, JSON.stringify(contents));
  return path;
}

function guard(
  args: string[],
  env: Record<string, string | undefined> = {},
): { code: number; output: string } {
  const merged: NodeJS.ProcessEnv = {
    ...process.env,
    NX_CONFIRM_PRODUCTION: '',
    // stated outright so these tests never depend on where the checkout's HEAD happens to be
    NX_RELEASE_TAG: 'v0.0.0-test',
  };
  for (const [key, value] of Object.entries(env)) {
    if (value === undefined) delete merged[key];
    else merged[key] = value;
  }
  try {
    const output = execFileSync('node', ['scripts/deploy-guard.mjs', ...args], {
      encoding: 'utf8',
      stdio: 'pipe',
      env: merged,
    });
    return { code: 0, output };
  } catch (error) {
    const failure = error as { status: number; stdout: string; stderr: string };
    return { code: failure.status, output: `${failure.stdout}${failure.stderr}` };
  }
}

afterAll(() => {
  // the temporary directory is small and the OS reclaims it; nothing to undo
});

describe('deploy guard', () => {
  it('accepts a staging build only when every environment-bearing field matches', () => {
    const result = guard(['staging', configFile('staging', STAGING_BUILD)]);
    expect(result.code).toBe(0);
    expect(result.output).toContain('configuration targets staging');
  });

  it('refuses the 9 September failure: a production build deployed as staging', () => {
    const result = guard(['staging', configFile('production', PRODUCTION_BUILD)]);
    expect(result.code).toBe(1);
    expect(result.output).toContain('REFUSING to deploy');
    expect(result.output).toContain('BAD');
  });

  it('refuses a staging build deployed as production', () => {
    const result = guard(['production', configFile('staging', STAGING_BUILD)], {
      NX_CONFIRM_PRODUCTION: 'yes',
    });
    expect(result.code).toBe(1);
    expect(result.output).toContain('REFUSING to deploy');
  });

  it('names the environment in its output, so the operator sees where it went', () => {
    const result = guard(['staging', configFile('staging', STAGING_BUILD)]);
    expect(result.output).toContain('target=staging');
    expect(result.output).toContain('nexphase-labs-staging');
    expect(result.output).toContain('nexphase-documents-staging');
  });

  it('catches a single wrong field, not just a wholly wrong environment', () => {
    for (const [field, wrong] of [
      ['name', { name: 'nexphaselabs' }],
      ['APP_ENV', { vars: { ...STAGING_BUILD.vars, APP_ENV: 'production' } }],
      ['database', { d1_databases: [{ database_name: 'nexphase-labs' }] }],
      ['bucket', { r2_buckets: [{ bucket_name: 'nexphase-documents' }] }],
      ['origin', { vars: { ...STAGING_BUILD.vars, PUBLIC_ORIGIN: 'https://nexphaselabs.net' } }],
      ['targetEnvironment', { targetEnvironment: undefined }],
    ] as const) {
      const result = guard([
        'staging',
        configFile(`staging-bad-${field}`, { ...STAGING_BUILD, ...wrong }),
      ]);
      expect(result.code, `a wrong ${field} must be refused`).toBe(1);
    }
  });

  it('will not guess the target', () => {
    expect(guard([]).code).toBe(2);
    expect(guard(['prod', configFile('production2', PRODUCTION_BUILD)]).code).toBe(2);
    expect(guard(['staging', join(dir, 'does-not-exist.json')]).code).toBe(2);
  });

  it('never lets production be a side effect: the confirmation is separate from the target', () => {
    const path = configFile('production3', PRODUCTION_BUILD);
    expect(guard(['production', path]).code).toBe(1);
    expect(guard(['production', path], { NX_CONFIRM_PRODUCTION: 'yes' }).code).toBe(0);
  });

  describe('the version tag is the only path to production', () => {
    const confirmed = { NX_CONFIRM_PRODUCTION: 'yes' };
    const path = () => configFile('production-tag', PRODUCTION_BUILD);

    it('refuses production when HEAD is not at a tag', () => {
      const result = guard(['production', path()], { ...confirmed, NX_RELEASE_TAG: '' });
      expect(result.code).toBe(1);
      expect(result.output).toContain('released from a version tag');
      expect(result.output).toContain('git tag -a v1.2.3');
    });

    it('refuses a tag that is not a version tag', () => {
      const result = guard(['production', path()], {
        ...confirmed,
        NX_RELEASE_TAG: 'last-known-good',
      });
      expect(result.code).toBe(1);
      expect(result.output).toContain('not a v* tag');
    });

    it('accepts a v* tag and says which release it is deploying', () => {
      const result = guard(['production', path()], { ...confirmed, NX_RELEASE_TAG: 'v1.4.0' });
      expect(result.code).toBe(0);
      expect(result.output).toContain('v1.4.0');
    });

    it('reads the tag from the workflow ref when the run is a tag push', () => {
      const onATag = guard(['production', path()], {
        ...confirmed,
        NX_RELEASE_TAG: undefined,
        GITHUB_REF_TYPE: 'tag',
        GITHUB_REF_NAME: 'v2.0.0',
      });
      expect(onATag.code).toBe(0);
      // a workflow_dispatch pointed at a branch reaches the guard as ref_type=branch
      const onABranch = guard(['production', path()], {
        ...confirmed,
        GITHUB_REF_TYPE: 'branch',
        GITHUB_REF_NAME: 'main',
        NX_RELEASE_TAG: '',
      });
      expect(onABranch.code).toBe(1);
    });

    it('leaves staging alone — staging deploys from main, not from tags', () => {
      const result = guard(['staging', configFile('staging-tagless', STAGING_BUILD)], {
        NX_RELEASE_TAG: '',
      });
      expect(result.code).toBe(0);
    });
  });
});
