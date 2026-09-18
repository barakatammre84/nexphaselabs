import { env } from 'cloudflare:workers';
import { checkDependencies, checkMigrationState } from '@/lib/health';
import { expectedMigrationTags } from '@/lib/migrations';
import { releaseCommit } from '@/lib/release';

/**
 * Deployment smoke check. Says whether the worker is up and whether its
 * schema and document storage are readable, which commit it was built from,
 * and (in staging only) whether D1 has the build's complete migration history.
 * Not a business launch approval.
 * No caching, no secrets, no business data, and no writes.
 */
export async function GET() {
  const health = await checkDependencies(env);
  // Migration proof is intentionally staging-only. Production keeps its
  // existing dependency health contract and is not queried by this check.
  const migration = env.APP_ENV === 'staging' ? await checkMigrationState(env.DB, expectedMigrationTags()) : null;
  const ok = health.ok && (migration === null || migration.ok);
  return Response.json(
    {
      ...health,
      ...(migration ? { migration } : {}),
      ok,
      env: env.APP_ENV ?? 'unknown',
      release: releaseCommit(),
      at: new Date().toISOString(),
    },
    { status: ok ? 200 : 503, headers: { 'Cache-Control': 'no-store' } },
  );
}
