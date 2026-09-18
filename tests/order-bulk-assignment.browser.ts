import { AsyncLocalStorage } from 'node:async_hooks';
import { execFileSync } from 'node:child_process';
import { createServer, type Server } from 'node:http';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { chromium, type Browser, type BrowserContext, type Page } from 'playwright-core';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { localD1 } from './helpers/local-d1';

const harness = vi.hoisted(() => ({
  env: {} as { DB?: D1Database },
  request: () => new Request('http://127.0.0.1/'),
}));
vi.mock('cloudflare:workers', () => ({ env: harness.env }));
vi.mock('next/headers', () => ({ headers: async () => harness.request().headers, cookies: async () => ({ get: () => undefined }) }));
vi.mock('next/navigation', () => ({ redirect: () => { throw new Error('Unauthorized private page'); } }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/lib/staff-auth', async (original) => {
  const auth = await original<typeof import('@/lib/staff-auth')>();
  const principal = () => {
    const role = harness.request().headers.get('x-rehearsal-role');
    return role === 'admin' || role === 'ops'
      ? { id: `synthetic-${role}`, role, name: `Synthetic ${role}`, email: `${role}@example.invalid`, sessionId: 'private', mustChangePassword: false }
      : null;
  };
  return { ...auth, requireStaff: async () => {
    const staff = principal();
    if (!staff) throw new Error('Unauthorized private page');
    return staff;
  } };
});

import ManageOrdersPage from '@/app/manage/orders/page';
import { bulkAssignOrdersAction, type BulkOrderAssignmentState } from '@/app/manage/orders/actions';
import { BulkAssignmentView } from '@/app/manage/orders/bulk-assignment-form';
import { getDb } from '@/db';
import { accounts, orderEvents, orders, staffUsers } from '@/db/schema';

const requestScope = new AsyncLocalStorage<Request>();
const rows = [
  { id: 'order-a', orderNumber: 'NX-260918-0001', status: 'paid', lastTransitionId: null },
  { id: 'order-b', orderNumber: 'NX-260918-0002', status: 'paid', lastTransitionId: null },
];
const owners = [{ id: 'synthetic-admin', name: 'Synthetic admin' }, { id: 'synthetic-ops', name: 'Synthetic ops' }];
let local: ReturnType<typeof localD1>;
let server: Server;
let browser: Browser;
let origin: string;
let contexts: BrowserContext[] = [];
let serverErrors: string[] = [];

function document(body: string) {
  return `<!doctype html><html><head><title>Bulk assignment rehearsal</title></head><body>${body}</body></html>`;
}

async function renderPage(role: string, state?: BulkOrderAssignmentState) {
  if (state || role === 'admin') {
    return document(renderToStaticMarkup(
      createElement(BulkAssignmentView, {
        rows,
        owners,
        state: state ?? { changed: [], unchanged: [] },
        action: '/manage/orders/bulk-assignment',
      }),
    ));
  }
  return document(renderToStaticMarkup(await ManageOrdersPage({ searchParams: Promise.resolve({}) })));
}

beforeAll(async () => {
  harness.request = () => {
    const request = requestScope.getStore();
    if (!request) throw new Error('No private request scope');
    return request;
  };
  server = createServer(async (incoming, outgoing) => {
    try {
      const chunks: Buffer[] = [];
      for await (const chunk of incoming) chunks.push(Buffer.from(chunk));
      const request = new Request(`${origin}${incoming.url}`, {
        method: incoming.method,
        headers: incoming.headers as HeadersInit,
        ...(chunks.length ? { body: Buffer.concat(chunks) } : {}),
      });
      const response = await requestScope.run(request, async () => {
        const role = request.headers.get('x-rehearsal-role') ?? '';
        if (request.method === 'GET' && new URL(request.url).pathname === '/manage/orders') {
          try {
            return new Response(await renderPage(role), { headers: { 'content-type': 'text/html; charset=utf-8' } });
          } catch (error) {
            return new Response(String(error), { status: 403 });
          }
        }
        if (request.method === 'POST' && new URL(request.url).pathname === '/manage/orders/bulk-assignment') {
          try {
            const state = await bulkAssignOrdersAction({ changed: [], unchanged: [] }, await request.formData());
            return new Response(await renderPage(role, state), { status: state.error?.startsWith('Only administrators') ? 403 : 200, headers: { 'content-type': 'text/html; charset=utf-8' } });
          } catch (error) {
            return new Response(String(error), { status: 403 });
          }
        }
        return new Response('No private route', { status: 404 });
      });
      outgoing.writeHead(response.status, Object.fromEntries(response.headers));
      outgoing.end(await response.text());
    } catch (error) {
      serverErrors.push(String(error));
      outgoing.writeHead(500);
      outgoing.end('Private harness failed');
    }
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('No private listener');
  origin = `http://127.0.0.1:${address.port}`;
  browser = await chromium.launch({
    executablePath: execFileSync('which', ['chromium'], { encoding: 'utf8' }).trim(),
    headless: true,
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-background-networking'],
  });
});

beforeEach(async () => {
  local = localD1();
  harness.env.DB = local.binding;
  await getDb().insert(accounts).values({
    id: 'account', email: 'buyer@example.invalid', name: 'Buyer', passwordHash: 'unused',
  });
  await getDb().insert(staffUsers).values(owners.map((owner) => ({
    ...owner, email: `${owner.id}@example.invalid`, role: owner.id.endsWith('admin') ? 'admin' as const : 'ops' as const, passwordHash: 'unused',
  })));
  await getDb().insert(orders).values(rows.map((row) => ({
    ...row, accountId: 'account', subtotalCents: 100, totalCents: 100, priceTier: 'institutional',
    consigneeName: 'Synthetic', shipToLine1: 'Test', shipToCity: 'Test', shipToRegion: 'CA',
    shipToPostalCode: '00000', shipToCountry: 'US', submittedAt: new Date('2026-09-18T12:00:00Z'),
  })));
  serverErrors = [];
});

afterEach(async () => {
  for (const context of contexts) await context.close();
  contexts = [];
  local.sqlite.close();
  delete harness.env.DB;
  expect(serverErrors).toEqual([]);
});

afterAll(async () => {
  await browser?.close();
  if (server) await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
});

async function pageFor(role: 'admin' | 'ops') {
  const context = await browser.newContext({ extraHTTPHeaders: { 'x-rehearsal-role': role }, serviceWorkers: 'block' });
  contexts.push(context);
  const page = await context.newPage();
  await page.goto(`${origin}/manage/orders`);
  return page;
}

async function completeForm(page: Page) {
  const form = page.locator('form').filter({ hasText: 'Assign selected orders' });
  await form.locator('[name="assignedTo"]').selectOption('synthetic-ops');
  await form.locator('[name="serviceDueAt"]').fill(futureDue());
  for (const checkbox of await form.locator('[name="orders"]').all()) await checkbox.check();
  return form;
}

function futureDue() {
  return new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString().slice(0, 16);
}

describe('private browser bulk-order assignment rehearsal', () => {
  it('assigns multiple selected orders and renders every changed order exactly', async () => {
    const page = await pageFor('admin');
    const form = await completeForm(page);
    await Promise.all([page.waitForNavigation(), form.locator('button[type="submit"]').click()]);
    expect(await page.getByRole('status').innerText()).toBe(
      'Changed: NX-260918-0001, NX-260918-0002\n\nNot changed: none',
    );
    const saved = await getDb().select().from(orders);
    expect(saved.map(({ assignedTo }) => assignedTo)).toEqual(['synthetic-ops', 'synthetic-ops']);
    expect(await getDb().select().from(orderEvents)).toHaveLength(2);
  });

  it('hides and rejects the bulk workflow for a non-administrator', async () => {
    const page = await pageFor('ops');
    expect(await page.getByText('Assign selected orders').count()).toBe(0);
    const response = await page.context().request.post(`${origin}/manage/orders/bulk-assignment`, {
      headers: { origin },
      form: {
        assignedTo: 'synthetic-ops',
        serviceDueAt: futureDue(),
        orders: JSON.stringify(rows[0]),
      },
    });
    expect(response.status()).toBe(403);
    expect(await response.text()).toContain('Only administrators can assign multiple orders.');
    expect((await getDb().select().from(orders))[0].assignedTo).toBeNull();
  });

  it('rejects the complete selection after a concurrent change and lists every unchanged order exactly', async () => {
    const page = await pageFor('admin');
    const form = await completeForm(page);
    local.sqlite.prepare("UPDATE orders SET last_transition_id = 'concurrent-change' WHERE id = 'order-a'").run();
    await Promise.all([page.waitForNavigation(), form.locator('button[type="submit"]').click()]);
    expect(await page.getByRole('alert').innerText()).toBe(
      'No orders changed because at least one selected order was updated by someone else. Reload and try again.\n' +
      '\nChanged: none\n\nNot changed: NX-260918-0001, NX-260918-0002',
    );
    const saved = await getDb().select().from(orders);
    expect(saved.map(({ assignedTo }) => assignedTo)).toEqual([null, null]);
    expect(await getDb().select().from(orderEvents)).toHaveLength(0);
  });
});