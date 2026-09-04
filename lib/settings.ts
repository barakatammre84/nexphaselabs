import { env } from 'cloudflare:workers';
import { sql } from 'drizzle-orm';
import { getDb } from '@/db';
import { settings } from '@/db/schema';
import { ENTITY } from '@/lib/entity';
import type { ResponsibleParty } from '@/lib/hazard';
import type { StaffPrincipal } from '@/lib/staff-auth';
import { isSettingKey, type SettingKey, type SettingsMap } from '@/lib/settings-keys';

export {
  SETTING_KEYS,
  SETTING_LABEL,
  isSettingKey,
  type SettingKey,
  type SettingsMap,
} from '@/lib/settings-keys';

/**
 * Facts the owner sets, that documents need and code must not invent.
 *
 * A GHS label has to carry the address and telephone number of the party
 * responsible for the material. Neither is on record for this entity, and
 * inventing them would be the single worst thing this module could do — so
 * they are stored here, empty until set, and the label generator refuses
 * until they are.
 */


export async function readSettings(): Promise<SettingsMap> {
  const rows = await getDb().select().from(settings);
  const map: SettingsMap = {};
  for (const row of rows) {
    if (isSettingKey(row.key) && row.value.trim()) map[row.key] = row.value.trim();
  }
  return map;
}

/**
 * Write settings. Each key is upserted with who changed it and when; a value
 * cleared to empty removes the row, so "not set" stays distinguishable from
 * "set to nothing".
 */
export async function writeSettings(
  values: Partial<Record<SettingKey, string>>,
  staff: StaffPrincipal,
): Promise<void> {
  const db = getDb();
  const now = Math.floor(Date.now() / 1000);
  const actor = `${staff.name} (${staff.id})`;
  for (const [key, raw] of Object.entries(values)) {
    if (!isSettingKey(key)) continue;
    const value = String(raw ?? '').trim();
    if (!value) {
      await db.run(sql`DELETE FROM settings WHERE key = ${key}`);
      continue;
    }
    await db.run(
      sql`INSERT INTO settings (key, value, updated_by, updated_at)
          VALUES (${key}, ${value}, ${actor}, ${now})
          ON CONFLICT(key) DO UPDATE SET value = excluded.value,
                                         updated_by = excluded.updated_by,
                                         updated_at = excluded.updated_at`,
    );
  }
}

/**
 * The responsible party as a label must state it. The name comes from the
 * entity constants because the trading and legal names are not the owner's
 * to change from a settings form; the address and telephone are.
 */
export function responsiblePartyFrom(map: SettingsMap): ResponsibleParty {
  return {
    name: `${ENTITY.tradingName} · ${ENTITY.legalName}`,
    address: map['entity.registered_address'] ?? null,
    telephone: map['entity.telephone'] ?? null,
  };
}

/* ------------------------------------------------------------------------ */
/* Pictogram artwork                                                          */
/* ------------------------------------------------------------------------ */

/**
 * The UN pictograms are prescribed artwork, not something to approximate.
 * They are uploaded once and stored under a fixed key per code; the label
 * renderer embeds whatever is there and refuses to print a label for a code
 * that has none.
 */
export function pictogramKey(code: string): string {
  const upper = code.trim().toUpperCase();
  if (!/^GHS0[1-9]$/.test(upper)) throw new Error(`Invalid pictogram code: ${code}`);
  return `ghs/${upper}.png`;
}

function bucket(): R2Bucket {
  if (!env.DOCS) {
    throw new Error(
      'Cloudflare R2 binding `DOCS` is unavailable. Check `r2_buckets` in wrangler.jsonc.',
    );
  }
  return env.DOCS;
}

export async function putPictogram(
  code: string,
  bytes: Uint8Array,
  staff: StaffPrincipal,
): Promise<void> {
  // PNG magic bytes. The renderer embeds this directly, so a file that is not
  // a PNG would fail at print time rather than upload time.
  if (
    bytes.length < 8 ||
    bytes[0] !== 0x89 ||
    bytes[1] !== 0x50 ||
    bytes[2] !== 0x4e ||
    bytes[3] !== 0x47
  ) {
    throw new Error('Pictogram artwork must be a PNG.');
  }
  await bucket().put(pictogramKey(code), bytes, {
    httpMetadata: { contentType: 'image/png' },
    customMetadata: {
      code: code.trim().toUpperCase(),
      uploadedBy: `${staff.name} (${staff.id})`,
      uploadedAt: new Date().toISOString(),
    },
  });
}

export async function getPictogram(code: string): Promise<Uint8Array | null> {
  const object = await bucket().get(pictogramKey(code));
  if (!object) return null;
  return new Uint8Array(await object.arrayBuffer());
}

/** Which pictogram codes have artwork on file. */
export async function availablePictograms(): Promise<string[]> {
  const listed = await bucket().list({ prefix: 'ghs/' });
  return listed.objects
    .map((object) => object.key.slice('ghs/'.length).replace(/\.png$/i, '').toUpperCase())
    .filter((code) => /^GHS0[1-9]$/.test(code))
    .sort();
}
