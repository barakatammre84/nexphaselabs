import { env } from 'cloudflare:workers';
import { checkDependencies } from '@/lib/health';

/**
 * Deployment smoke check. Says whether the worker is up and whether its
 * schema and document storage are readable. Not a business launch approval.
 * No caching, no secrets, no business data, and no writes.
 */
export async function GET() {
  const health = await checkDependencies(env);
  return Response.json(
    { ...health, env: env.APP_ENV ?? 'unknown', at: new Date().toISOString() },
    { status: health.ok ? 200 : 503, headers: { 'Cache-Control': 'no-store' } },
  );
}
