import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  sameOrigin: vi.fn(),
  getStaff: vi.fn(),
  canFinance: vi.fn(),
  getOrder: vi.fn(),
  allow: vi.fn(),
  mutations: vi.fn(),
}));

vi.mock('@/lib/staff-auth', () => ({
  sameOrigin: mocks.sameOrigin,
  getStaffFromRequest: mocks.getStaff,
  canManageFinance: mocks.canFinance,
}));
vi.mock('@/lib/orders', () => ({
  getOrderByNumber: mocks.getOrder,
  markOrderPaid: mocks.mutations,
  recordRefund: mocks.mutations,
  transitionOrder: mocks.mutations,
}));
vi.mock('@/lib/lots-admin', () => ({
  recordedBy: (staff: { id: string; name: string }) =>
    `${staff.name} (${staff.id})`,
}));
vi.mock('@/lib/payments', () => ({
  invalidateBtcpayInvoice: mocks.mutations,
}));
vi.mock('@/lib/zelle-config', () => ({
  zelleMode: () => 'disabled',
}));
vi.mock('@/lib/payment-attempts', () => ({ reconcilePaymentAttempt: mocks.mutations }));
vi.mock('@/lib/shipping-labels', () => ({
  currentShippingLabel: vi.fn(),
  voidShippingLabel: mocks.mutations,
  reconcileShippingLabelRefund: mocks.mutations,
}));
vi.mock('@/lib/rate-limit', () => ({
  allow: mocks.allow,
  rateLimitKey: (scope: string, id: string) => `${scope}:${id}`,
}));

import { POST as paid } from '@/app/api/manage/orders/[orderNumber]/paid/route';
import { POST as refund } from '@/app/api/manage/orders/[orderNumber]/refund/route';
import { POST as cancel } from '@/app/api/manage/orders/[orderNumber]/cancel/route';
import { POST as reconcilePayment } from '@/app/api/manage/orders/[orderNumber]/reconcile-payment/route';
import { POST as shippingRefund } from '@/app/api/manage/orders/[orderNumber]/shipping/refund/route';
import { POST as shippingReconcile } from '@/app/api/manage/orders/[orderNumber]/shipping/refund/reconcile/route';

type Route = (request: Request, context: { params: Promise<{ orderNumber: string }> }) => Promise<Response>;
const routes: [string, Route][] = [
  ['paid', paid],
  ['refund', refund],
  ['cancel', cancel],
  ['payment reconciliation', reconcilePayment],
  ['shipping refund', shippingRefund],
  ['shipping refund reconciliation', shippingReconcile],
];
const context = { params: Promise.resolve({ orderNumber: 'NX-260904-0001' }) };
const request = () =>
  new Request('https://test.example.org/api/manage/orders/NX-260904-0001', {
    method: 'POST',
    headers: { host: 'test.example.org', origin: 'https://test.example.org' },
  });
const staff = (role: string) => ({ id: `staff-${role}`, name: role, role });

beforeEach(() => {
  vi.clearAllMocks();
  mocks.sameOrigin.mockReturnValue(true);
  mocks.getStaff.mockResolvedValue(staff('admin'));
  mocks.canFinance.mockReturnValue(true);
  mocks.getOrder.mockResolvedValue(null);
  mocks.allow.mockResolvedValue(true);
});

describe('financial and destructive route authorization', () => {
  it.each(routes)('%s rejects cross-origin requests before authentication or mutation', async (_name, route) => {
    mocks.sameOrigin.mockReturnValue(false);
    expect((await route(request(), context)).status).toBe(403);
    expect(mocks.getStaff).not.toHaveBeenCalled();
    expect(mocks.canFinance).not.toHaveBeenCalled();
    expect(mocks.mutations).not.toHaveBeenCalled();
  });

  it.each(routes)('%s rejects anonymous requests', async (_name, route) => {
    mocks.getStaff.mockResolvedValue(null);
    expect((await route(request(), context)).status).toBe(401);
    expect(mocks.canFinance).not.toHaveBeenCalled();
    expect(mocks.mutations).not.toHaveBeenCalled();
  });

  it.each(routes)('%s denies QC and operations before mutation', async (_name, route) => {
    for (const role of ['qc', 'ops']) {
      mocks.getStaff.mockResolvedValue(staff(role));
      mocks.canFinance.mockReturnValue(false);
      expect((await route(request(), context)).status).toBe(403);
    }
    expect(mocks.mutations).not.toHaveBeenCalled();
  });

  it.each(routes)('%s accepts the admin permission gate', async (_name, route) => {
    expect((await route(request(), context)).status).toBe(404);
    expect(mocks.canFinance).toHaveBeenCalledWith(expect.objectContaining({ role: 'admin' }));
  });
});