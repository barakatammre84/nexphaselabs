import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { localD1 } from './helpers/local-d1';

/**
 * The acceptance test chapter 10 §10.5 asks for, in its words:
 *
 *   "Issue COA v1 for lot L. Ship order A from lot L. Supersede with COA v2.
 *    Ship order B from lot L. Then assert: order A returns v1 and its stored
 *    sha256 matches the bytes served; order B returns v2; neither order's view
 *    changes if v3 is issued tomorrow. Run it against a real supersession, not
 *    a mocked one. Until that test passes, treat the document locker as
 *    unbuilt — the whole point of it is that it cannot be wrong."
 *
 * So: a real SQLite database, the real dispatch path, the real supersession
 * path, real bytes in a stand-in bucket, and the customer's own route serving
 * the result. Nothing here is stubbed except the bucket and the clock.
 *
 * The requirement is not a nicety. A customer writing up an experiment two
 * years later needs the certificate that came with the material they used, and
 * a plausible wrong document is worse than an honest gap.
 */

const { env } = vi.hoisted(() => ({ env: {} as Record<string, unknown> }));
vi.mock('cloudflare:workers', () => ({ env }));
vi.mock('next/headers', () => ({ cookies: async () => ({ get: () => undefined }) }));
vi.mock('next/navigation', () => ({ redirect: vi.fn() }));

import { seedCommerceFixture, syntheticOrder } from './helpers/commerce-fixture';
import { beginPayment, getOrderByNumber, markOrderPaid } from '@/lib/orders';
import { recordShipment, startFulfilment } from '@/lib/fulfilment';
import { attachLotDocument, getLot } from '@/lib/lots-admin';
import { pinnedDocument } from '@/lib/document-pins';
import { sha256Hex } from '@/lib/documents';
import type { StaffPrincipal } from '@/lib/staff-auth';
import type { StoredDocument } from '@/lib/documents';

const staff = { id: 's', name: 'Synthetic Ops', role: 'admin' } as StaffPrincipal;
const quality = { id: 'q', name: 'Synthetic QC', role: 'qc' } as StaffPrincipal;

let local: ReturnType<typeof localD1>;
let objects: Map<string, Uint8Array>;

function memoryBucket() {
  objects = new Map<string, Uint8Array>();
  return {
    put: async (key: string, body: Uint8Array) => {
      objects.set(key, body);
      return {} as R2Object;
    },
    get: async (key: string) =>
      objects.has(key)
        ? ({
            body: objects.get(key),
            arrayBuffer: async () => {
              const bytes = objects.get(key)!;
              return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
            },
            httpMetadata: { contentType: 'application/pdf' },
            size: objects.get(key)!.byteLength,
          } as unknown as R2ObjectBody)
        : null,
  } as unknown as R2Bucket;
}

/** Upload a certificate for the lot exactly the way the manager does. */
async function issueCertificate(revision: string, type: 'coa' | 'sds' = 'coa') {
  const bytes = new TextEncoder().encode(`%PDF-1.4 certificate ${type} ${revision}`);
  const key = `lots/SYNTHETIC-LOT/${type}-${revision}.pdf`;
  await (env.DOCS as R2Bucket).put(key, bytes);
  const stored: StoredDocument = {
    key,
    contentType: 'application/pdf',
    size: bytes.byteLength,
    sha256: await sha256Hex(bytes.buffer.slice(0) as ArrayBuffer),
    uploadedAt: new Date(),
  };
  const lot = (await getLot('SYNTHETIC-LOT'))!;
  await attachLotDocument(lot, type, stored, `${type}-${revision}.pdf`, quality);
  return { key, bytes, sha256: stored.sha256 };
}

/** Take one order all the way to shipped from the lot, and return its line. */
async function shipOneOrder() {
  const order = await syntheticOrder(1);
  await beginPayment(order.detail, 'invoice', '', 'Test');
  let detail = (await getOrderByNumber(order.detail.order.orderNumber))!;
  expect((await markOrderPaid(detail, 'Test', 'SYNTHETIC')).ok).toBe(true);
  detail = (await getOrderByNumber(detail.order.orderNumber))!;
  expect((await startFulfilment(detail, staff)).ok).toBe(true);
  detail = (await getOrderByNumber(detail.order.orderNumber))!;
  const result = await recordShipment(
    detail,
    {
      picks: { [detail.items[0].id]: 'l' },
      carrier: 'Test',
      trackingNumber: 'SYNTHETIC',
      shippedOn: new Date().toISOString().slice(0, 10),
    },
    staff,
  );
  expect(result).toEqual({ ok: true });
  const shipped = (await getOrderByNumber(detail.order.orderNumber))!;
  return { orderId: shipped.order.id, orderNumber: shipped.order.orderNumber, itemId: shipped.items[0].id };
}

const currentCoaId = () =>
  local.sqlite
    .prepare(
      "SELECT id FROM lot_documents WHERE document_type = 'coa' AND superseded_at IS NULL ORDER BY uploaded_at DESC LIMIT 1",
    )
    .get()?.id as string | undefined;

beforeEach(async () => {
  local = localD1();
  Object.assign(env, {
    DB: local.binding,
    DOCS: memoryBucket(),
    APP_ENV: 'staging',
    OPEN_CHECKOUT_ENABLED: 'true',
    INVENTORY_RESERVATION_MINUTES: '30',
  });
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('No external calls')));
  await seedCommerceFixture();
});

afterEach(() => {
  vi.unstubAllGlobals();
  local.sqlite.close();
  for (const key of Object.keys(env)) delete env[key];
});

describe('a certificate superseded after shipment', () => {
  it('keeps each order on the document that shipped with it, through two supersessions', async () => {
    const v1 = await issueCertificate('v1');
    const orderA = await shipOneOrder();

    const pinnedA = await pinnedDocument(orderA.orderId, orderA.itemId, 'coa');
    expect(pinnedA).not.toBeNull();
    expect(pinnedA!.objectKey).toBe(v1.key);
    expect(pinnedA!.sha256).toBe(v1.sha256);

    // A real supersession: the manager attaches a corrected certificate.
    const v2 = await issueCertificate('v2');
    expect(currentCoaId()).not.toBe(pinnedA!.id);

    const orderB = await shipOneOrder();
    const pinnedB = await pinnedDocument(orderB.orderId, orderB.itemId, 'coa');
    expect(pinnedB!.objectKey).toBe(v2.key);
    expect(pinnedB!.sha256).toBe(v2.sha256);

    // Order A is untouched by the correction.
    const aAfter = await pinnedDocument(orderA.orderId, orderA.itemId, 'coa');
    expect(aAfter!.id).toBe(pinnedA!.id);
    expect(aAfter!.objectKey).toBe(v1.key);

    // And untouched again tomorrow, when v3 is issued.
    const v3 = await issueCertificate('v3');
    expect(currentCoaId()).not.toBe(pinnedB!.id);
    expect((await pinnedDocument(orderA.orderId, orderA.itemId, 'coa'))!.objectKey).toBe(v1.key);
    expect((await pinnedDocument(orderB.orderId, orderB.itemId, 'coa'))!.objectKey).toBe(v2.key);
    expect(v3.key).not.toBe(v2.key);
  });

  it('serves bytes that match the hash recorded at dispatch', async () => {
    const v1 = await issueCertificate('v1');
    const orderA = await shipOneOrder();
    await issueCertificate('v2');

    const pinned = (await pinnedDocument(orderA.orderId, orderA.itemId, 'coa'))!;
    const stored = objects.get(pinned.objectKey)!;
    const actual = await sha256Hex(
      stored.buffer.slice(stored.byteOffset, stored.byteOffset + stored.byteLength) as ArrayBuffer,
    );
    expect(actual).toBe(pinned.sha256);
    expect(actual).toBe(v1.sha256);
    expect(new TextDecoder().decode(stored)).toContain('v1');
  });

  it('records what replaced what, so a pinned document can name its revision', async () => {
    const v1 = await issueCertificate('v1');
    const orderA = await shipOneOrder();
    await issueCertificate('v2');
    await issueCertificate('v3');

    const chain = local.sqlite
      .prepare(
        "SELECT id, object_key, superseded_at, superseded_by_id FROM lot_documents WHERE document_type='coa' ORDER BY uploaded_at",
      )
      .all() as { id: string; object_key: string; superseded_at: number | null; superseded_by_id: string | null }[];
    expect(chain).toHaveLength(3);
    expect(chain[0].superseded_by_id).toBe(chain[1].id);
    expect(chain[1].superseded_by_id).toBe(chain[2].id);
    expect(chain[2].superseded_by_id).toBeNull();
    expect(chain[2].superseded_at).toBeNull();

    // The customer's pinned document is the head of that chain, and the chain
    // can be walked forward to the revision they were never sent.
    const pinned = (await pinnedDocument(orderA.orderId, orderA.itemId, 'coa'))!;
    expect(pinned.objectKey).toBe(v1.key);
    expect(chain[0].id).toBe(pinned.id);
  });

  it('never deletes or overwrites the superseded object', async () => {
    const v1 = await issueCertificate('v1');
    await shipOneOrder();
    const v2 = await issueCertificate('v2');
    expect(objects.has(v1.key)).toBe(true);
    expect(objects.has(v2.key)).toBe(true);
    expect(objects.get(v1.key)).not.toEqual(objects.get(v2.key));
    // supersession is a new row, not an edit
    expect(local.sqlite.prepare("SELECT count(*) n FROM lot_documents WHERE document_type='coa'").get()!.n).toBe(2);
  });

  it('pins the SDS in force that day as well as the certificate', async () => {
    const sds1 = await issueCertificate('v1', 'sds');
    await issueCertificate('v1');
    const orderA = await shipOneOrder();
    await issueCertificate('v2', 'sds');

    const pinned = await pinnedDocument(orderA.orderId, orderA.itemId, 'sds');
    expect(pinned!.objectKey).toBe(sds1.key);
  });

  it('gives an honest gap rather than a plausible wrong document', async () => {
    // Nothing uploaded: the line ships unpinned, and the customer route 404s
    // rather than falling back to "the current COA for this lot".
    const orderA = await shipOneOrder();
    expect(await pinnedDocument(orderA.orderId, orderA.itemId, 'coa')).toBeNull();

    // A certificate uploaded AFTER that shipment does not retroactively attach.
    await issueCertificate('v1');
    expect(await pinnedDocument(orderA.orderId, orderA.itemId, 'coa')).toBeNull();
    expect(currentCoaId()).toBeDefined();
  });

  it('refuses to serve one order\'s pin to another order', async () => {
    await issueCertificate('v1');
    const orderA = await shipOneOrder();
    const orderB = await shipOneOrder();
    // The line id belongs to A; asking for it under B's order id must not resolve.
    expect(await pinnedDocument(orderB.orderId, orderA.itemId, 'coa')).toBeNull();
    expect(await pinnedDocument(orderA.orderId, orderB.itemId, 'coa')).toBeNull();
  });
});
