'use server';

import { headers } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { getOrderByNumber } from '@/lib/orders';
import { handoffOrder, type OrderHandoffInput } from '@/lib/order-handoffs';
import { canFulfil, requireStaff } from '@/lib/staff-auth';
import { requestContactVerification } from '@/lib/order-contact-verification';

export type OrderHandoffState = {
  values: Record<string, string>;
  errors: string[];
  saved: boolean;
};

async function sameOriginAction() {
  const h = await headers();
  const host = h.get('host');
  const source = h.get('origin') ?? h.get('referer');
  if (!host || !source) return false;
  try { return new URL(source).host === host; } catch { return false; }
}

export async function handoffOrderAction(
  orderNumber: string,
  _previous: OrderHandoffState,
  data: FormData,
): Promise<OrderHandoffState> {
  const values = Object.fromEntries(
    ['assignedTo', 'serviceDueAt', 'note'].map((field) => {
      const value = data.get(field);
      return [field, typeof value === 'string' ? value : ''];
    }),
  );
  const fail = (error: string): OrderHandoffState => ({ values, errors: [error], saved: false });
  if (!(await sameOriginAction())) return fail('Request rejected: cross-origin.');
  const staff = await requireStaff(`/manage/orders/${encodeURIComponent(orderNumber)}`);
  try {
    const detail = await getOrderByNumber(orderNumber);
    if (!detail) return fail('The order no longer exists.');
    const result = await handoffOrder(detail.order, values as OrderHandoffInput, staff);
    if (!result.ok) return fail(result.error);
    revalidatePath('/manage');
    revalidatePath('/manage/orders');
    revalidatePath(`/manage/orders/${orderNumber}`);
    return { values, errors: [], saved: true };
  } catch (error) {
    console.error('[orders] handoff failed', error instanceof Error ? error.message : error);
    return fail('The assignment could not be saved. Try again shortly.');
  }
}

/**
 * Ask the customer again to confirm the address on this order.
 *
 * Reachability is what a recall depends on (chapter 10 §10.6), so this exists on
 * the fulfilment desk rather than buried in the customer's account. It sends the
 * request; it does not hold the order.
 */
export async function resendContactVerificationAction(orderNumber: string): Promise<void> {
  if (!(await sameOriginAction())) return;
  const staff = await requireStaff(`/manage/orders/${encodeURIComponent(orderNumber)}`);
  if (!canFulfil(staff)) return;
  try {
    const detail = await getOrderByNumber(orderNumber);
    if (!detail) return;
    await requestContactVerification(detail.order.id, { resend: true });
    revalidatePath(`/manage/orders/${orderNumber}`);
  } catch (error) {
    console.error(
      '[orders] verification resend failed',
      error instanceof Error ? error.message : error,
    );
  }
}
