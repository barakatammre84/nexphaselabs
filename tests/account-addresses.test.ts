import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { localD1 } from './helpers/local-d1';

const { env } = vi.hoisted(() => ({ env: {} as Record<string, unknown> }));
vi.mock('cloudflare:workers', () => ({ env }));

import { getDb } from '@/db';
import { accounts } from '@/db/schema';
import {
  MAX_SAVED_ADDRESSES,
  addressIssues,
  archiveAddress,
  getAddress,
  listAddresses,
  rememberOrderAddress,
  saveAddress,
  setDefaultAddress,
} from '@/lib/account-addresses';
import type { ShipTo } from '@/lib/orders';

/**
 * Chapter 10 c10-addresses. The rules that matter are the boundaries: an
 * address belongs to one account and cannot be read or changed from another,
 * removing one archives it rather than deleting it, and saving the same address
 * twice is the common case rather than an error.
 */

let local: ReturnType<typeof localD1>;

const bench: ShipTo = {
  consigneeName: 'A Researcher',
  consigneeInstitution: 'Independent laboratory',
  line1: '1 Bench Street',
  line2: null,
  city: 'Oakland',
  region: 'CA',
  postalCode: '94607',
  country: 'US',
  phone: '+1 555 0100',
};

const other: ShipTo = { ...bench, line1: '2 Other Street', consigneeInstitution: null, phone: null };

async function addAccount(id: string) {
  await getDb().insert(accounts).values({
    id,
    email: `${id}@example.invalid`,
    name: 'Synthetic',
    passwordHash: 'unused',
  } as never);
}

beforeEach(async () => {
  local = localD1();
  Object.assign(env, { DB: local.binding });
  await addAccount('acct_one');
  await addAccount('acct_two');
});

afterEach(() => {
  local.sqlite.close();
  for (const key of Object.keys(env)) delete env[key];
});

describe('what may be saved', () => {
  it('accepts a complete address', () => {
    expect(addressIssues(bench)).toEqual([]);
  });

  it('refuses an incomplete one, naming every missing field', () => {
    const issues = addressIssues({ ...bench, consigneeName: '', city: '', postalCode: ' ' });
    expect(issues).toHaveLength(3);
    expect(issues.join(' ')).toContain('Recipient name');
    expect(issues.join(' ')).toContain('ZIP code');
  });

  it('applies the same country rule as checkout', () => {
    expect(addressIssues({ ...bench, country: 'CA' }).join(' ')).toContain('United States');
  });

  it('refuses control characters, which is how a header is smuggled into a label', () => {
    expect(addressIssues({ ...bench, line1: '1 Bench\nStreet' }).join(' ')).toContain('control characters');
  });
});

describe('saving and listing', () => {
  it('saves the first address as the default', async () => {
    const result = await saveAddress('acct_one', { ...bench, label: 'Lab' });
    expect(result.ok).toBe(true);
    const [saved] = await listAddresses('acct_one');
    expect(saved.label).toBe('Lab');
    expect(saved.isDefault).toBe(true);
    expect(saved.shipTo).toEqual(bench);
  });

  it('treats saving the same address again as using it, not as a duplicate', async () => {
    const first = await saveAddress('acct_one', bench);
    const again = await saveAddress('acct_one', { ...bench, phone: '+1 555 0999' });
    expect(again).toEqual(first);
    expect(await listAddresses('acct_one')).toHaveLength(1);
  });

  it('moves the default when asked, and only one is ever default', async () => {
    await saveAddress('acct_one', { ...bench, label: 'Lab' });
    const second = await saveAddress('acct_one', { ...other, label: 'Home bench' }, { makeDefault: true });
    const saved = await listAddresses('acct_one');
    expect(saved.filter((address) => address.isDefault)).toHaveLength(1);
    expect(saved[0].id).toBe(second.ok ? second.id : '');
    expect(saved[0].label).toBe('Home bench');
  });

  it('caps how many can be kept', async () => {
    for (let i = 0; i < MAX_SAVED_ADDRESSES; i += 1) {
      expect((await saveAddress('acct_one', { ...bench, line1: `${i} Bench Street` })).ok).toBe(true);
    }
    const overflow = await saveAddress('acct_one', { ...bench, line1: '99 Bench Street' });
    expect(overflow.ok).toBe(false);
    expect(overflow.ok === false && overflow.error).toContain('Remove one');
  });

  it('refuses to save what checkout would refuse', async () => {
    const result = await saveAddress('acct_one', { ...bench, postalCode: '' });
    expect(result.ok).toBe(false);
    expect(await listAddresses('acct_one')).toEqual([]);
  });
});

describe('one account cannot touch another account\'s address', () => {
  it('will not read it', async () => {
    const saved = await saveAddress('acct_one', bench);
    const addressId = saved.ok ? saved.id : '';
    expect(await getAddress('acct_one', addressId)).not.toBeNull();
    expect(await getAddress('acct_two', addressId)).toBeNull();
  });

  it('will not default it or archive it', async () => {
    const saved = await saveAddress('acct_one', bench);
    const addressId = saved.ok ? saved.id : '';
    expect((await setDefaultAddress('acct_two', addressId)).ok).toBe(false);
    expect((await archiveAddress('acct_two', addressId)).ok).toBe(false);
    expect(await listAddresses('acct_one')).toHaveLength(1);
  });
});

describe('removing one', () => {
  it('archives rather than deletes, so an order against it stays explicable', async () => {
    const saved = await saveAddress('acct_one', bench);
    expect((await archiveAddress('acct_one', saved.ok ? saved.id : '')).ok).toBe(true);
    expect(await listAddresses('acct_one')).toEqual([]);
    expect(local.sqlite.prepare('SELECT count(*) n FROM account_addresses').get()!.n).toBe(1);
    expect(
      local.sqlite.prepare('SELECT archived_at FROM account_addresses').get()!.archived_at,
    ).not.toBeNull();
  });

  it('cannot be archived twice', async () => {
    const saved = await saveAddress('acct_one', bench);
    const addressId = saved.ok ? saved.id : '';
    expect((await archiveAddress('acct_one', addressId)).ok).toBe(true);
    expect((await archiveAddress('acct_one', addressId)).ok).toBe(false);
  });

  it('leaves an archived address out of the list but lets the same one be saved again', async () => {
    const saved = await saveAddress('acct_one', bench);
    await archiveAddress('acct_one', saved.ok ? saved.id : '');
    expect((await saveAddress('acct_one', bench)).ok).toBe(true);
    expect(await listAddresses('acct_one')).toHaveLength(1);
  });
});

describe('remembering the address an order used', () => {
  it('saves it and marks it used', async () => {
    await rememberOrderAddress('acct_one', bench, 'Lab');
    const [saved] = await listAddresses('acct_one');
    expect(saved.shipTo.line1).toBe('1 Bench Street');
    expect(saved.lastUsedAt).not.toBeNull();
  });

  it('does not multiply on a second order to the same place', async () => {
    await rememberOrderAddress('acct_one', bench);
    await rememberOrderAddress('acct_one', bench);
    expect(await listAddresses('acct_one')).toHaveLength(1);
  });

  it('stays silent rather than throwing when the address is unusable', async () => {
    await expect(rememberOrderAddress('acct_one', { ...bench, city: '' })).resolves.toBeUndefined();
    expect(await listAddresses('acct_one')).toEqual([]);
  });
});
