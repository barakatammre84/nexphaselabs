import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  role: null as 'admin' | 'qc' | 'ops' | null,
  documentKind: 'invoice' as 'coa' | 'invoice' | 'packing_slip' | 'hazcom',
  documentLookups: 0,
  issuedObjectReads: 0,
  lotLookups: 0,
  lotObjectReads: 0,
}));

vi.mock('@/lib/staff-auth', () => ({
  getStaffFromRequest: async () =>
    state.role
      ? {
          id: 'staff_synthetic',
          email: 'staff@example.invalid',
          name: 'Synthetic Staff',
          role: state.role,
          mustChangePassword: false,
        }
      : null,
  canFulfil: (staff: { role: string }) =>
    staff.role === 'admin' || staff.role === 'ops',
  canManageStaff: (staff: { role: string }) => staff.role === 'admin',
  canRecordResults: (staff: { role: string }) =>
    staff.role === 'admin' || staff.role === 'qc',
}));

vi.mock('@/lib/issued-documents', () => ({
  DOCUMENT_KIND_LABEL: {
    coa: 'Certificate of Analysis',
    invoice: 'Invoice',
    packing_slip: 'Packing Slip',
    hazcom: 'HazCom',
  },
  documentById: async () => {
    state.documentLookups += 1;
    return {
      kind: state.documentKind,
      objectKey: `issued/${state.documentKind}/synthetic.pdf`,
      documentNumber: 'SYNTHETIC-1',
    };
  },
  getIssuedObject: async () => {
    state.issuedObjectReads += 1;
    return {};
  },
}));

vi.mock('@/lib/lots-admin', () => ({
  getLot: async () => {
    state.lotLookups += 1;
    return { coaKey: 'lots/synthetic/coa.pdf' };
  },
  currentDocumentKey: () => 'lots/synthetic/coa.pdf',
}));

vi.mock('@/lib/documents', () => ({
  documentResponse: () => new Response('document'),
  getLotDocument: async () => {
    state.lotObjectReads += 1;
    return {};
  },
  isDocumentType: (value: string) =>
    ['coa', 'sds', 'chromatogram', 'mass_spec'].includes(value),
}));

vi.mock('@/lib/lot-rules', () => ({
  lotNumberFromParam: (value: string) => value,
}));

import { GET as issuedDocument } from '@/app/api/manage/documents/[id]/route';
import { GET as lotDocument } from '@/app/api/manage/lots/[lotNumber]/documents/[type]/route';

const getIssuedDocument = () =>
  issuedDocument(
    new Request('https://test.invalid/api/manage/documents/doc_12345678'),
    { params: Promise.resolve({ id: 'doc_12345678' }) },
  );

const getLotDocument = () =>
  lotDocument(
    new Request(
      'https://test.invalid/api/manage/lots/LOT-001/documents/coa',
    ),
    { params: Promise.resolve({ lotNumber: 'LOT-001', type: 'coa' }) },
  );

beforeEach(() => {
  state.role = null;
  state.documentKind = 'invoice';
  state.documentLookups = 0;
  state.issuedObjectReads = 0;
  state.lotLookups = 0;
  state.lotObjectReads = 0;
});

describe('staff issued-document authorization', () => {
  it.each([
    ['qc', 'invoice'],
    ['qc', 'packing_slip'],
    ['qc', 'hazcom'],
    ['ops', 'coa'],
    ['ops', 'hazcom'],
  ] as const)('denies %s access to %s bytes', async (role, kind) => {
    state.role = role;
    state.documentKind = kind;

    expect((await getIssuedDocument()).status).toBe(403);
    expect(state.documentLookups).toBe(1);
    expect(state.issuedObjectReads).toBe(0);
  });

  it.each([
    ['qc', 'coa'],
    ['ops', 'invoice'],
    ['ops', 'packing_slip'],
    ['admin', 'hazcom'],
  ] as const)('allows %s access to %s', async (role, kind) => {
    state.role = role;
    state.documentKind = kind;

    expect((await getIssuedDocument()).status).toBe(200);
    expect(state.issuedObjectReads).toBe(1);
  });
});

describe('staff private lot-document authorization', () => {
  it('denies operations before looking up the lot', async () => {
    state.role = 'ops';

    expect((await getLotDocument()).status).toBe(403);
    expect(state.lotLookups).toBe(0);
    expect(state.lotObjectReads).toBe(0);
  });

  it.each(['qc', 'admin'] as const)('allows %s access', async (role) => {
    state.role = role;

    expect((await getLotDocument()).status).toBe(200);
    expect(state.lotLookups).toBe(1);
    expect(state.lotObjectReads).toBe(1);
  });
});