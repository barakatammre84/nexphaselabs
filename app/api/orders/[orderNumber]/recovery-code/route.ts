import { getBuyerFromRequest } from '@/lib/buyer-session';
import { issueOrderRecoveryCode } from '@/lib/guest-order-recovery';
import { orderNumberFromParam } from '@/lib/order-rules';
import { allow, rateLimitKey } from '@/lib/rate-limit';
import { sameOrigin } from '@/lib/staff-auth';

export async function POST(request: Request, { params }: { params: Promise<{ orderNumber: string }> }) {
  const reply = (body: unknown, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' } });
  if (!sameOrigin(request)) return reply({ error: 'Forbidden' }, 403);
  const buyer = await getBuyerFromRequest(request);
  if (!buyer) return reply({ error: 'Unauthorized' }, 401);
  const number = orderNumberFromParam((await params).orderNumber);
  if (!number) return reply({ error: 'Not found' }, 404);
  if (!(await allow(rateLimitKey('recovery-code', buyer.id), 10, 3600))) return reply({ error: 'Try again later.' }, 429);
  const result = await issueOrderRecoveryCode(buyer, number);
  return result ? reply(result) : reply({ error: 'Not found' }, 404);
}
