import { and, asc, eq } from 'drizzle-orm';
import { getDb } from '@/db';
import {
  orderEvents,
  orderItems,
  orders,
  type Order,
  type OrderEvent,
  type OrderItem,
} from '@/db/schema';

/** Lightweight read model for customer and recovery pages. */
export type OrderDetail = {
  order: Order;
  items: OrderItem[];
  events: OrderEvent[];
};

async function withDetail(order: Order): Promise<OrderDetail> {
  const db = getDb();
  const [items, events] = await Promise.all([
    db
      .select()
      .from(orderItems)
      .where(eq(orderItems.orderId, order.id))
      .orderBy(asc(orderItems.createdAt)),
    db
      .select()
      .from(orderEvents)
      .where(eq(orderEvents.orderId, order.id))
      .orderBy(asc(orderEvents.createdAt)),
  ]);
  return { order, items, events };
}

export async function getOrderForAccount(
  accountId: string,
  orderNumber: string,
): Promise<OrderDetail | null> {
  const [order] = await getDb()
    .select()
    .from(orders)
    .where(
      and(eq(orders.orderNumber, orderNumber), eq(orders.accountId, accountId)),
    )
    .limit(1);
  return order ? withDetail(order) : null;
}

export async function getOrderByNumber(
  orderNumber: string,
): Promise<OrderDetail | null> {
  const [order] = await getDb()
    .select()
    .from(orders)
    .where(eq(orders.orderNumber, orderNumber))
    .limit(1);
  return order ? withDetail(order) : null;
}
