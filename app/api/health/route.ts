import { env } from 'cloudflare:workers';
import { checkDependencies } from '@/lib/health';
import { releaseCommit } from '@/lib/release';

/**
 * Deployment smoke check. Says whether the worker is up and whether its
 * schema and document storage are readable, and which commit it was built from.
 * Not a business launch approval.
 * No caching, no secrets, no business data, and no writes.
 */
export async function GET() {
  const health = await checkDependencies(env);
  return Response.json(
    { ...health, env: env.APP_ENV ?? 'unknown', release: releaseCommit(), at: new Date().toISOString() },
    { status: health.ok ? 200 : 503, headers: { 'Cache-Control': 'no-store' } },
  );
}
