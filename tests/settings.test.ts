import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { localD1 } from './helpers/local-d1';

const { env } = vi.hoisted(() => ({ env: {} as Record<string, unknown> }));
vi.mock('cloudflare:workers', () => ({ env }));

import { SETTING_KEYS, readSettings, writeSettings } from '@/lib/settings';
import type { StaffPrincipal } from '@/lib/staff-auth';

let local: ReturnType<typeof localD1>;
const staff = { id: 'staff_1', name: 'Sam' } as StaffPrincipal;
const rows = () => local.sqlite.prepare('SELECT key, value, updated_by FROM settings ORDER BY key').all() as Record<string, unknown>[];

beforeEach(() => {
  local = localD1();
  env.DB = local.binding;
});
afterEach(() => {
  local.sqlite.close();
  delete env.DB;
});

/**
 * These settings are what a hazard-communication label and the partner agreement print, so a
 * write that silently does nothing is worse than one that fails loudly. Until 16 Sep 2026 the
 * writer batched raw parameterised statements, which were never bound: every save was a no-op.
 */
describe('owner settings', () => {
  it('writes several values in one go and reads them back', async () => {
    await writeSettings(
      { [SETTING_KEYS.registeredAddress]: '2715 W Kettleman Ln', [SETTING_KEYS.telephone]: '+1 415-930-1422' },
      staff,
    );
    expect(rows()).toEqual([
      { key: 'entity.registered_address', value: '2715 W Kettleman Ln', updated_by: 'Sam (staff_1)' },
      { key: 'entity.telephone', value: '+1 415-930-1422', updated_by: 'Sam (staff_1)' },
    ]);
    const map = await readSettings();
    expect(map[SETTING_KEYS.registeredAddress]).toBe('2715 W Kettleman Ln');
  });

  it('updates a value in place, keeping one row per key', async () => {
    await writeSettings({ [SETTING_KEYS.telephone]: '+1 111' }, staff);
    await writeSettings({ [SETTING_KEYS.telephone]: '+1 222' }, { id: 'staff_2', name: 'Mel' } as StaffPrincipal);
    expect(rows()).toEqual([{ key: 'entity.telephone', value: '+1 222', updated_by: 'Mel (staff_2)' }]);
  });

  it('clears a key when the value is emptied, so "not set" stays different from "set to nothing"', async () => {
    await writeSettings({ [SETTING_KEYS.telephone]: '+1 111' }, staff);
    await writeSettings({ [SETTING_KEYS.telephone]: '   ' }, staff);
    expect(rows()).toEqual([]);
    expect(await readSettings()).toEqual({});
  });

  it('ignores a key that is not a setting, and a write with nothing in it', async () => {
    await writeSettings({ 'not.a.setting': 'x' } as never, staff);
    await writeSettings({}, staff);
    expect(rows()).toEqual([]);
  });
});
