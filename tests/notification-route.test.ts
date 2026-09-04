import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ sameOrigin: vi.fn(), getStaffFromRequest: vi.fn(), canManageStaff: vi.fn(), dispatchNotifications: vi.fn(), handleNotification: vi.fn() }));
vi.mock('@/lib/staff-auth', () => mocks);
vi.mock('@/lib/notifications', () => mocks);
import { POST } from '@/app/api/manage/notifications/route';
const request = (fields: Record<string, string>) => new Request('https://test.example.org/api/manage/notifications', { method: 'POST', body: new URLSearchParams(fields) });
beforeEach(() => {
  vi.clearAllMocks();
  mocks.sameOrigin.mockReturnValue(true);
  mocks.getStaffFromRequest.mockResolvedValue({ id: 'staff1', name: 'Admin', role: 'admin' });
  mocks.canManageStaff.mockReturnValue(true);
  mocks.dispatchNotifications.mockResolvedValue({ attention: 0 });
  mocks.handleNotification.mockResolvedValue(true);
});
describe('notification manager access and actions', () => {
  it('rejects cross-origin requests before any delivery', async () => {
    mocks.sameOrigin.mockReturnValue(false);
    expect((await POST(request({ action: 'dispatch' }))).status).toBe(403);
    expect(mocks.dispatchNotifications).not.toHaveBeenCalled();
  });
  it('requires a signed-in staff member', async () => {
    mocks.getStaffFromRequest.mockResolvedValue(null);
    expect((await POST(request({ action: 'dispatch' }))).status).toBe(401);
    expect(mocks.dispatchNotifications).not.toHaveBeenCalled();
  });
  it('forbids staff without administrative authority', async () => {
    mocks.canManageStaff.mockReturnValue(false);
    expect((await POST(request({ action: 'dispatch' }))).status).toBe(403);
    expect(mocks.dispatchNotifications).not.toHaveBeenCalled();
  });
  it('allows an administrator to process a bounded batch', async () => {
    expect((await POST(request({ action: 'dispatch' }))).status).toBe(303);
    expect(mocks.dispatchNotifications).toHaveBeenCalledWith();
  });
  it('attributes a manual action to the actual signed-in staff member', async () => {
    await POST(request({ id: 'order:event1', action: 'retry', note: 'Checked configuration', actor: 'forged' }));
    expect(mocks.handleNotification).toHaveBeenCalledWith('order:event1', 'retry', 'Admin (staff1)', 'Checked configuration');
  });
  it.each([{ id: '', action: 'retry' }, { id: 'order1', action: 'send' }, { id: '../order1', action: 'resolve' }])('rejects malformed handling requests %o', async (fields) => {
    expect((await POST(request(fields))).headers.get('location')).toContain('result=failed');
    expect(mocks.handleNotification).not.toHaveBeenCalled();
  });
  it('reports failure without leaking internal errors', async () => {
    mocks.dispatchNotifications.mockRejectedValueOnce(new Error('sensitive internals'));
    const response = await POST(request({ action: 'dispatch' }));
    expect(response.headers.get('location')).toContain('result=failed');
    expect(await response.text()).not.toContain('sensitive');
  });
});
