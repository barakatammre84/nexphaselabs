import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { sql } from 'drizzle-orm';
import { localD1 } from './helpers/local-d1';
const { env } = vi.hoisted(() => ({ env: {} as { DB?: D1Database } }));
vi.mock('cloudflare:workers', () => ({ env }));
import { getDb } from '@/db';
import { accounts, organizations } from '@/db/schema';
import { listVerificationQueue } from '@/lib/organizations';

let local: ReturnType<typeof localD1>;
beforeEach(async () => {
  local = localD1();
  env.DB = local.binding;
  await getDb().insert(accounts).values(Array.from({ length: 55 }, (_, i) => ({
    id: `account_${i}`, email: `applicant${i}@example.invalid`, name: `Applicant ${i}`, passwordHash: 'disabled',
  })));
  await getDb().insert(organizations).values(Array.from({ length: 55 }, (_, i) => ({
    id: `org_${i}`, accountId: `account_${i}`, legalName: i === 54 ? 'Target Research' : `Research ${i}`,
    website: `https://lab${i}.example.invalid`, emailDomain: `lab${i}.example.invalid`,
    organizationType: 'analytical_lab', addressLine1: '1 Test Way', city: 'Test', region: 'CA',
    postalCode: '00000', country: 'US', researchContext: 'Testing', receivingParty: 'Applicant',
    submittedAt: new Date(1700000000000 + i * 1000), verificationStatus: 'submitted', reviewFlags: [],
  })));
});
afterEach(() => { local.sqlite.close(); delete env.DB; });

describe('staff verification queue query', () => {
  it('paginates and searches before pagination', async () => {
    const first = await listVerificationQueue({ page: 1 });
    const second = await listVerificationQueue({ page: 2 });
    expect(first.rows).toHaveLength(50);
    expect(first.hasNext).toBe(true);
    expect(second.rows).toHaveLength(5);
    expect((await listVerificationQueue({ query: 'target' })).rows.map((row) => row.organization.legalName)).toEqual(['Target Research']);
  });
  it('filters status in SQL', async () => {
    await getDb().update(organizations).set({ verificationStatus: 'approved' }).where(sql`id = 'org_54'`);
    expect((await listVerificationQueue({ status: 'approved' })).rows.map((row) => row.organization.id)).toEqual(['org_54']);
  });
});