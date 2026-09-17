import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { localD1 } from './helpers/local-d1';
import { seedCommerceFixture, syntheticOrder } from './helpers/commerce-fixture';

const { env } = vi.hoisted(() => ({ env: {} as Record<string, unknown> }));
vi.mock('cloudflare:workers', () => ({ env }));
vi.mock('next/headers', () => ({ cookies: async () => ({ get: () => undefined }) }));
vi.mock('next/navigation', () => ({ redirect: vi.fn() }));
vi.mock('@/lib/account-auth', () => ({ requireAccount: async () => ({ id: 'acct_page', email: 'a@example.invalid', status: 'active', tier: 'researcher' }) }));

import { pinnedDocumentsForAccount } from '@/lib/document-pins';
import { releasedLotsByProduct } from '@/lib/lots-public';
import { LotLibrary } from '@/components/site/lot-library';
import AccountDocumentsPage from '@/app/account/documents/page';

let local: ReturnType<typeof localD1>;
beforeEach(async () => {
  local = localD1();
  Object.assign(env, { DB: local.binding, APP_ENV: 'staging', OPEN_CHECKOUT_ENABLED: 'true' });
  await seedCommerceFixture();
});
afterEach(() => {
  local.sqlite.close();
  for (const key of Object.keys(env)) delete env[key];
});

describe('customer document library', () => {
  it('lists only the account\'s own lines that shipped with a pinned document, newest order first', async () => {
    const first = await syntheticOrder(1);
    const second = await syntheticOrder(2); // a different guest buyer
    local.sqlite
      .prepare("UPDATE order_items SET coa_document_id = 'doc_coa', lot_number = 'SYNTHETIC-LOT' WHERE order_id = ?")
      .run(first.detail.order.id);
    local.sqlite.prepare("UPDATE order_items SET sds_document_id = 'doc_sds' WHERE order_id = ?").run(second.detail.order.id);

    const mine = await pinnedDocumentsForAccount(first.buyer.id);
    expect(mine).toHaveLength(1);
    expect(mine[0]).toMatchObject({
      orderNumber: first.detail.order.orderNumber,
      productCode: 'NPL-9999',
      lotNumber: 'SYNTHETIC-LOT',
      coaDocumentId: 'doc_coa',
      sdsDocumentId: null,
      quantity: 1,
    });
    expect(mine[0].orderedAt).toBeInstanceOf(Date);

    const theirs = await pinnedDocumentsForAccount(second.buyer.id);
    expect(theirs.map((line) => line.sdsDocumentId)).toEqual(['doc_sds']);

    // A line with nothing pinned (not dispatched) is not a document.
    local.sqlite.prepare('UPDATE order_items SET sds_document_id = NULL').run();
    expect(await pinnedDocumentsForAccount(second.buyer.id)).toEqual([]);
    expect(await pinnedDocumentsForAccount('nobody')).toEqual([]);
  });

  it('renders the page with per-line document links and the empty state', async () => {
    const empty = renderToStaticMarkup(await AccountDocumentsPage());
    expect(empty).toContain('Nothing has shipped yet.');
    expect(empty).toContain('href="/documentation/lot-lookup"');
    expect(empty).toContain('href="/account/documents"'); // nav item

    const order = await syntheticOrder(1);
    local.sqlite.prepare("UPDATE orders SET account_id = 'acct_page' WHERE id = ?").run(order.detail.order.id);
    local.sqlite
      .prepare("UPDATE order_items SET coa_document_id = 'doc_coa', sds_document_id = 'doc_sds', lot_number = 'SYNTHETIC-LOT' WHERE order_id = ?")
      .run(order.detail.order.id);
    const html = renderToStaticMarkup(await AccountDocumentsPage());
    const itemId = (local.sqlite.prepare('SELECT id FROM order_items WHERE order_id = ?').get(order.detail.order.id) as { id: string }).id;
    expect(html).toContain(`Order ${order.detail.order.orderNumber}`);
    expect(html).toContain(`/api/orders/${order.detail.order.orderNumber}/items/${itemId}/documents/coa`);
    expect(html).toContain(`/api/orders/${order.detail.order.orderNumber}/items/${itemId}/documents/sds`);
    expect(html).toContain('href="/lots/SYNTHETIC-LOT"');
    expect(html).toContain('recorded at dispatch');
  });
});

describe('public lot library', () => {
  it('links the certificate file when one is on record and folds earlier lots into a details block', async () => {
    const insert = local.sqlite.prepare(
      "INSERT INTO lots (id, lot_number, product_code, product_name, cas_number, status, analytical_lab, accession_number, testing_standard, received_at, released_at, coa_key, quantity_remaining, quantity_received) VALUES (?, ?, 'NPL-9999', 'Synthetic', '50-00-0', 'released', 'Fixture lab', ?, 'Fixture panel v1', ?, ?, ?, '10 mg', '10 mg')",
    );
    const now = Math.floor(Date.now() / 1000);
    for (let i = 1; i <= 8; i += 1) insert.run(`lot_${i}`, `LIB-00${i}`, `ACC-${i}`, now - i * 86_400, now - i * 86_400, i === 1 ? 'coa/lib-001.pdf' : null);
    const [entry] = (await releasedLotsByProduct()).filter((product) => product.productCode === 'NPL-9999');
    expect(entry.lots).toHaveLength(9); // 8 here + the fixture lot
    expect(entry.lots.find((lot) => lot.lotNumber === 'LIB-001')?.hasCoa).toBe(true);
    expect(entry.lots.find((lot) => lot.lotNumber === 'LIB-002')?.hasCoa).toBe(false);

    const html = renderToStaticMarkup(React.createElement(LotLibrary, { products: [entry] }));
    expect(html).toContain('href="/api/lots/LIB-001/documents/coa"');
    expect(html).not.toContain('href="/api/lots/LIB-002/documents/coa"');
    expect(html).toContain('<details');
    expect(html).toContain('3 earlier lots');
    expect(html).toContain('href="/lots/LIB-008"');
  });
});
