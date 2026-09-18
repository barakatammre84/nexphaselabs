import { env } from 'cloudflare:workers';
import { runStagingRefundRehearsal } from '@/lib/staging-refund-rehearsal';
import { releaseCommit } from '@/lib/release';
import { sameOrigin } from '@/lib/staff-auth';

/**
 * Private-to-the-release staging rehearsal. It creates one synthetic order,
 * exercises recordRefund, and removes the fixture before returning.
 *
 * The release header is not a secret. It prevents an old workflow retry from
 * exercising a newer worker, while the environment check keeps this route
 * unavailable to production.
 */
export async function POST(request: Request) {
  if (env.APP_ENV !== 'staging') return new Response('Not found', { status: 404 });
  if (!sameOrigin(request)) return new Response('Forbidden', { status: 403 });
  const release = releaseCommit();
  if (!release || request.headers.get('x-staging-refund-rehearsal-release') !== release) {
    return new Response('Not found', { status: 404 });
  }

  try {
    const report = await runStagingRefundRehearsal(release);
    return Response.json(report, {
      status: report.ok ? 200 : 500,
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (error) {
    console.error(
      '[staging] refund rehearsal failed',
      error instanceof Error ? error.message : error,
    );
    return Response.json(
      {
        ok: false,
        release,
        fixture: 'synthetic-staging-refund',
        paymentProviderContacted: false,
        moneySent: false,
        error: 'The staging refund rehearsal could not complete.',
      },
      { status: 500, headers: { 'Cache-Control': 'no-store' } },
    );
  }
}