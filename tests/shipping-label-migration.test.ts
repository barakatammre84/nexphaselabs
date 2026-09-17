import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { env } = vi.hoisted(() => ({ env: {} as Record<string, unknown> }));
vi.mock('cloudflare:workers', () => ({ env }));
vi.mock('next/headers', () => ({
  cookies: async () => ({ get: () => undefined }),
}));
vi.mock('next/navigation', () => ({ redirect: vi.fn() }));

import { seedCommerceFixture, syntheticOrder } from './helpers/commerce-fixture';
import { localD1 } from './helpers/local-d1';

const migrationDirectory = fileURLToPath(
  new URL('../drizzle/', import.meta.url),
);
const migrationFiles = readdirSync(migrationDirectory)
  .filter((name) => /^\d+.*\.sql$/.test(name))
  .sort();

let local: ReturnType<typeof localD1>;

beforeEach(() => {
  local = localD1(false);
  Object.assign(env, {
    DB: local.binding,
    APP_ENV: 'staging',
    OPEN_CHECKOUT_ENABLED: 'true',
  });
});

afterEach(() => {
  local.sqlite.close();
  for (const key of Object.keys(env)) delete env[key];
});

describe('shipping label history migration', () => {
  it('replays every migration on a fresh database', () => {
    for (const file of migrationFiles)
      local.sqlite.exec(readFileSync(`${migrationDirectory}/${file}`, 'utf8'));
    const columns = local.sqlite
      .prepare('PRAGMA table_info(shipping_labels)')
      .all()
      .map((row) => row.name);
    expect(columns).toEqual(
      expect.arrayContaining([
        'origin_id',
        'refund_state',
        'refund_ref',
        'refund_reason',
      ]),
    );
    expect(
      local.sqlite.prepare('PRAGMA foreign_key_check').all(),
    ).toEqual([]);
  });

  it('preserves an existing label and permits replacement only after confirmed voiding', async () => {
    // Everything except the label-history migration itself and any later migration that
    // rebuilds a table with the origin columns 0047 adds (0064 rebuilds checkout_quotes), so the
    // fixture can be seeded with today's schema and 0047 then runs against rows that exist.
    const replayedAfter = migrationFiles.filter(
      (name) => name > '0047_clean_namorita.sql' && readFileSync(`${migrationDirectory}/${name}`, 'utf8').includes('origin_id'),
    );
    for (const file of migrationFiles.filter(
      (name) => name !== '0047_clean_namorita.sql' && !replayedAfter.includes(name),
    ))
      local.sqlite.exec(readFileSync(`${migrationDirectory}/${file}`, 'utf8'));
    await seedCommerceFixture();
    const order = (await syntheticOrder()).detail.order;
    local.sqlite
      .prepare(
        `INSERT INTO fulfillment_quotes
          (id, order_id, provider, shipment_id, rate_id, carrier, service,
           service_name, amount_cents, currency, test, expires_at, created_by)
         VALUES (?, ?, 'shippo', 'shipment-1', 'rate-1', 'USPS',
           'usps_ground_advantage', 'Ground Advantage', 558, 'USD', 1,
           unixepoch() + 1800, 'Migration test')`,
      )
      .run('quote-1', order.id);
    local.sqlite
      .prepare(
        `INSERT INTO shipping_labels
          (order_id, id, quote_id, state, provider_ref, tracking_number,
           carrier, service_name, amount_cents, test, created_by)
         VALUES (?, 'label-1', 'quote-1', 'ready', 'transaction-1',
           '9300000000000000000000', 'USPS', 'Ground Advantage', 558, 1,
           'Migration test')`,
      )
      .run(order.id);

    local.sqlite.exec(
      readFileSync(
        `${migrationDirectory}/0047_clean_namorita.sql`,
        'utf8',
      ),
    );
    for (const file of replayedAfter)
      local.sqlite.exec(readFileSync(`${migrationDirectory}/${file}`, 'utf8'));

    expect(
      local.sqlite
        .prepare(
          `SELECT id, order_id, state, origin_id, origin_label, provider_ref
           FROM shipping_labels WHERE id = 'label-1'`,
        )
        .get(),
    ).toMatchObject({
      id: 'label-1',
      order_id: order.id,
      state: 'ready',
      origin_id: 'primary',
      origin_label: 'Primary location',
      provider_ref: 'transaction-1',
    });
    expect(() =>
      local.sqlite
        .prepare(
          `INSERT INTO shipping_labels
            (id, order_id, quote_id, state, carrier, service_name,
             amount_cents, test, created_by)
           VALUES ('label-blocked', ?, 'quote-1', 'ready', 'USPS',
             'Ground Advantage', 558, 1, 'Migration test')`,
        )
        .run(order.id),
    ).toThrow();

    local.sqlite
      .prepare(
        `UPDATE shipping_labels
         SET state = 'voided', refund_state = 'success'
         WHERE id = 'label-1'`,
      )
      .run();
    local.sqlite
      .prepare(
        `INSERT INTO shipping_labels
          (id, order_id, quote_id, state, carrier, service_name,
           amount_cents, test, created_by)
         VALUES ('label-2', ?, 'quote-1', 'ready', 'USPS',
           'Ground Advantage', 558, 1, 'Migration test')`,
      )
      .run(order.id);
    expect(
      local.sqlite
        .prepare(
          'SELECT id, state FROM shipping_labels WHERE order_id = ? ORDER BY id',
        )
        .all(order.id),
    ).toEqual([
      { id: 'label-1', state: 'voided' },
      { id: 'label-2', state: 'ready' },
    ]);
    expect(
      local.sqlite.prepare('PRAGMA foreign_key_check').all(),
    ).toEqual([]);
  });
});
