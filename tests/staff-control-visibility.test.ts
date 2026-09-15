import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CaseFormState } from '@/app/manage/cases/actions';

vi.stubGlobal('React', React);
const { viewer, inbox } = vi.hoisted(() => ({
  viewer: { role: 'admin' as 'admin' | 'qc' | 'ops' },
  inbox: { configured: true },
}));
vi.mock('cloudflare:workers', () => ({ env: {} }));
vi.mock('next/headers', () => ({
  cookies: async () => ({ get: () => undefined }),
  headers: async () => new Headers(),
}));
vi.mock('next/navigation', () => ({ redirect: vi.fn(), notFound: vi.fn() }));
vi.mock('@/lib/staff-auth', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/staff-auth')>()),
  requireStaff: async () => ({
    id: `stf_${viewer.role}`,
    email: `${viewer.role}@example.invalid`,
    name: `Synthetic ${viewer.role}`,
    role: viewer.role,
    sessionId: 'ses_synthetic',
    mustChangePassword: false,
  }),
}));
// Only what each page reads is replaced; the permission helpers stay real.
vi.mock('@/lib/feedback', () => ({ feedbackCounts: async () => ({ unread: 0 }) }));
vi.mock('@/lib/hazcom', () => ({
  previewHazcom: async () => ({
    content: { outstanding: [] },
    documentNumber: 'HCP-2026-0001',
    current: null,
  }),
}));
vi.mock('@/lib/issued-documents', () => ({ documentHistory: async () => [] }));
vi.mock('@/lib/settings', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/settings')>()),
  readSettings: async () => ({}),
  availablePictograms: async () => [],
}));
vi.mock('@/lib/zelle', () => ({
  currentPacificDate: () => '2026-09-15',
  listZelleReceipts: async () => [],
  listZelleReconciliationRuns: async () => [],
  zelleMailboxHealth: async () => null,
  zelleReceiptCounts: async () => ({}),
}));
vi.mock('@/lib/zelle-config', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/zelle-config')>()),
  zelleConfigurationStatus: () => ({
    mode: inbox.configured ? 'supervised' : 'manual',
    recipientEmail: 'orders@nexphaselabs.net',
    recipientNameConfigured: true,
    qrConfigured: false,
    inboxConfigured: inbox.configured,
    checkoutEnabled: true,
    simulationEnabled: false,
    missing: [],
  }),
}));

import ManageLayout from '@/app/manage/layout';
import HazcomPage from '@/app/manage/hazcom/page';
import ZellePaymentsPage from '@/app/manage/payments/zelle/page';
import { CaseForm } from '@/components/manage/case-form';

/**
 * A control appears only where the route or rule behind it would let this person
 * through. Each of these used to render for someone its target refuses.
 */

beforeEach(() => {
  viewer.role = 'admin';
  inbox.configured = true;
});

describe('staff controls follow the guard behind them', () => {
  it('links Reports only for the roles the report exports admit', async () => {
    const nav = async () => renderToStaticMarkup(await ManageLayout({ children: null }));
    expect(await nav()).toContain('href="/manage/reports"');
    for (const role of ['qc', 'ops'] as const) {
      viewer.role = role;
      expect(await nav()).not.toContain('href="/manage/reports"');
    }
  });

  it('offers the hazard communication preview only to administrators', async () => {
    const page = async () =>
      renderToStaticMarkup(await HazcomPage({ searchParams: Promise.resolve({}) }));
    expect(await page()).toContain('href="/api/manage/hazcom"');
    for (const role of ['qc', 'ops'] as const) {
      viewer.role = role;
      expect(await page()).not.toContain('href="/api/manage/hazcom"');
    }
  });

  it('offers an inbox sync only to a decider, and only when the inbox can be synced', async () => {
    const page = async () =>
      renderToStaticMarkup(await ZellePaymentsPage({ searchParams: Promise.resolve({}) }));
    expect(await page()).toContain('action="/api/manage/payments/zelle/sync"');
    inbox.configured = false;
    expect(await page()).not.toContain('/api/manage/payments/zelle/sync');
    inbox.configured = true;
    viewer.role = 'ops';
    expect(await page()).not.toContain('/api/manage/payments/zelle/sync');
  });

  it('offers Closed only to administrators, and still shows a case that is already closed', () => {
    const form = (role: string, status: string) =>
      renderToStaticMarkup(
        React.createElement(CaseForm, {
          action: async (state: CaseFormState) => state,
          initial: { status, title: 'Synthetic case', summary: 'Synthetic summary', dueOn: '2026-09-30' },
          people: [],
          staff: { id: `stf_${role}`, role },
          mode: 'edit',
        }),
      );
    expect(form('admin', 'open')).toContain('<option value="closed">Closed</option>');
    expect(form('qc', 'open')).not.toContain('value="closed"');
    expect(form('ops', 'effectiveness_review')).not.toContain('value="closed"');
    expect(form('qc', 'closed')).toMatch(/<option value="closed" selected="">Closed<\/option>/);
  });
});
