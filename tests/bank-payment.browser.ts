import { AsyncLocalStorage } from 'node:async_hooks';
import { execFileSync } from 'node:child_process';
import { createServer, type Server } from 'node:http';
import { mkdir } from 'node:fs/promises';
import { renderToStaticMarkup } from 'react-dom/server';
import { chromium, type Browser, type BrowserContext, type Page } from 'playwright-core';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { localD1 } from './helpers/local-d1';

// These objects are private to Vitest's module graph. No process environment,
// Wrangler bindings, live credentials, remote DB, or running store is used.
const harness = vi.hoisted(() => ({
  env: {} as Record<string, unknown>,
  buyer: null as Awaited<ReturnType<typeof import('@/lib/buyer-session').getBuyer>>,
  request: () => new Request('http://127.0.0.1/'),
}));
vi.mock('cloudflare:workers', () => ({ env: harness.env }));
vi.mock('next/headers', () => ({
  cookies: async () => ({ get: () => undefined }),
  headers: async () => harness.request().headers,
}));
vi.mock('next/navigation', () => ({
  redirect: () => { throw new Error('Unexpected framework redirect'); },
  notFound: () => { throw new Error('Unexpected notFound'); },
}));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/lib/buyer-session', async (original) => ({
  ...(await original<typeof import('@/lib/buyer-session')>()),
  getBuyer: async () => harness.request().headers.get('x-rehearsal-role') === 'buyer' ? harness.buyer : null,
  getBuyerFromRequest: async (request: Request) =>
    request.headers.get('x-rehearsal-role') === 'buyer' ? harness.buyer : null,
}));
vi.mock('@/lib/staff-auth', async (original) => {
  const auth = await original<typeof import('@/lib/staff-auth')>();
  const principal = (request: Request) => {
    const role = request.headers.get('x-rehearsal-role');
    return role === 'admin' || role === 'ops'
      ? { id: `synthetic-${role}`, role, name: 'Synthetic staff', email: `${role}@example.invalid`, sessionId: 'private-harness', mustChangePassword: false }
      : null;
  };
  return {
    ...auth, // Real same-origin and role-permission checks remain in force.
    getStaffFromRequest: async (request: Request) => principal(request),
    requireStaff: async () => {
      const staff = principal(harness.request());
      if (!staff) throw new Error('Unauthorized private page');
      return staff;
    },
  };
});

import BuyerPage from '@/app/account/orders/[orderNumber]/page';
import StaffPage from '@/app/manage/orders/[orderNumber]/page';
import { POST as pay } from '@/app/api/orders/[orderNumber]/pay/route';
import { POST as claim } from '@/app/api/orders/[orderNumber]/zelle-claim/route';
import { POST as paid } from '@/app/api/manage/orders/[orderNumber]/paid/route';
import { POST as refund } from '@/app/api/manage/orders/[orderNumber]/refund/route';
import { POST as cancel } from '@/app/api/manage/orders/[orderNumber]/cancel/route';
import { seedBankPaymentRehearsal, submittedRehearsalOrder, syntheticZelleReceipt } from './helpers/bank-payment-rehearsal';
import { getOrderByNumber } from '@/lib/orders';
import { availablePaymentMethods } from '@/lib/payments';
import { recordZelleGmailMessage } from '@/lib/zelle';

const requestScope = new AsyncLocalStorage<Request>();
const outbound = vi.fn(() => Promise.reject(new Error('External network forbidden in payment rehearsal')));
let local: ReturnType<typeof localD1>;
let server: Server;
let origin: string;
let browser: Browser;
let contexts: BrowserContext[] = [];
let browserErrors: string[] = [];
let blockedRequests: string[] = [];
const handlers = { pay, 'zelle-claim': claim, paid, refund, cancel };

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
        const url = new URL(request.url);
        const api = /^\/api\/(manage\/)?orders\/([^/]+)\/([^/]+)$/.exec(url.pathname);
        if (request.method === 'POST' && api) {
          const action = api[3] as keyof typeof handlers;
          const staffAction = ['paid', 'refund', 'cancel'].includes(action);
          if (!handlers[action] || Boolean(api[1]) !== staffAction)
            return new Response('No private route', { status: 404 });
          return handlers[action](request, { params: Promise.resolve({ orderNumber: api[2] }) });
        }
        const page = /^\/(account|manage)\/orders\/([^/]+)$/.exec(url.pathname);
        if (request.method === 'GET' && page) {
          const component = page[1] === 'account' ? BuyerPage : StaffPage;
          const html = renderToStaticMarkup(await component({
            params: Promise.resolve({ orderNumber: page[2] }),
            searchParams: Promise.resolve(Object.fromEntries(url.searchParams)),
          }));
          return new Response(`<!doctype html><html><head><title>Private bank-payment rehearsal</title></head><body>${html}</body></html>`, {
            headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' },
          });
        }
        return new Response('No private route', { status: 404 });
      });
      outgoing.writeHead(response.status, Object.fromEntries(response.headers));
      outgoing.end(await response.text());
    } catch (error) {
      browserErrors.push(String(error));
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
  await mkdir('outputs/bank-payment-rehearsal', { recursive: true });
});

beforeEach(async () => {
  local = localD1();
  Object.assign(harness.env, {
    DB: local.binding,
    // Production-only adapter exercised in an unreachable, mocked module graph.
    APP_ENV: 'production',
    OPEN_CHECKOUT_ENABLED: 'true',
    INVENTORY_RESERVATION_MINUTES: '30',
    PUBLIC_ORIGIN: origin,
    PAYMENT_BANK_INSTRUCTIONS: 'SYNTHETIC BANK ONLY — do not send money',
    ZELLE_MODE: 'manual',
    ZELLE_RECIPIENT_EMAIL: 'recipient@example.invalid',
    ZELLE_RECIPIENT_NAME: 'Synthetic recipient — do not send money',
  });
  outbound.mockClear();
  vi.stubGlobal('fetch', outbound);
  browserErrors = [];
  blockedRequests = [];
  await seedBankPaymentRehearsal();
});

afterEach(async () => {
  for (const context of contexts) await context.close();
  contexts = [];
  local?.sqlite.close();
  harness.buyer = null;
  for (const key of Object.keys(harness.env)) delete harness.env[key];
  vi.unstubAllGlobals();
  expect(outbound).not.toHaveBeenCalled();
  expect(blockedRequests).toEqual([]);
  expect(browserErrors).toEqual([]);
});

afterAll(async () => {
  await browser?.close();
  if (server) await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
});

async function newPage(role: 'buyer' | 'admin' | 'ops') {
  const context = await browser.newContext({
    extraHTTPHeaders: { 'x-rehearsal-role': role },
    viewport: { width: 1280, height: 900 },
    serviceWorkers: 'block',
  });
  contexts.push(context);
  await context.route('**/*', (route) => {
    if (new URL(route.request().url()).origin === origin) return route.continue();
    blockedRequests.push(route.request().url());
    return route.abort();
  });
  const page = await context.newPage();
  page.on('pageerror', (error) => browserErrors.push(error.message));
  return page;
}

async function submit(page: Page, action: string, fields: Record<string, string>) {
  const form = page.locator(`form[action$="/${action}"]`);
  expect(await form.count()).toBe(1);
  for (const [name, value] of Object.entries(fields)) await form.locator(`[name="${name}"]`).fill(value);
  await Promise.all([page.waitForNavigation(), form.locator('button[type="submit"]').click()]);
  expect(page.url()).not.toContain('error=');
}

async function directPost(page: Page, path: string, fields: Record<string, string>, crossOrigin = false) {
  return page.context().request.post(`${origin}${path}`, {
    headers: { origin: crossOrigin ? 'https://attacker.invalid' : origin },
    form: fields,
    maxRedirects: 0,
  });
}

describe('private browser bank-payment rehearsal', () => {
  it('keeps ACH unavailable outside the private production mock', () => {
    for (const environment of ['development', 'staging', '', 'unknown']) {
      harness.env.APP_ENV = environment;
      expect(availablePaymentMethods().some((method) => method.id === 'bank_transfer')).toBe(false);
    }
  });

  it('shows automatic Zelle receipt settlement to buyer and staff without allowing manual override', async () => {
    Object.assign(harness.env, {
      ZELLE_MODE: 'automatic',
      ZELLE_RECIPIENT_EMAIL: 'payments@example.invalid',
      ZELLE_CHASE_SENDERS: 'alerts@bank.invalid',
    });
    const fixture = await submittedRehearsalOrder();
    harness.buyer = fixture.buyer;
    const number = fixture.detail.order.orderNumber;
    const buyer = await newPage('buyer');
    const admin = await newPage('admin');
    await buyer.goto(`${origin}/account/orders/${number}`);
    await buyer.locator('input[name="method"][value="zelle"]').check();
    await submit(buyer, 'pay', {});
    await submit(buyer, 'zelle-claim', { payer_name: 'Synthetic Buyer' });
    await admin.goto(`${origin}/manage/orders/${number}`);
    expect(await admin.locator('form[action$="/paid"]').count()).toBe(0);
    expect((await directPost(admin, `/api/manage/orders/${number}/paid`, { reference: 'SYNTHETIC-OVERRIDE' })).headers().location).toContain('error=');
    expect((await getOrderByNumber(number))!.order.paymentStatus).toBe('pending');
    expect(await recordZelleGmailMessage(syntheticZelleReceipt(number, 'synthetic-wrong', '1.01'))).toMatchObject({ outcome: 'review' });
    await buyer.reload();
    expect(await buyer.locator('body').innerText()).toContain('Your order remains unpaid');
    const receipt = syntheticZelleReceipt(number, 'synthetic-exact');
    expect(await recordZelleGmailMessage(receipt)).toMatchObject({ outcome: 'paid' });
    expect(await recordZelleGmailMessage(receipt)).toMatchObject({ duplicate: true });
    await buyer.goto(`${origin}/account/orders/${number}`);
    await admin.reload();
    expect(await buyer.locator('body').innerText()).toContain('Payment is confirmed.');
    expect(await admin.locator('body').innerText()).toContain('Latest: matched');
    expect(await admin.locator('body').innerText()).toContain('Claim status: matched');
    await buyer.screenshot({ path: 'outputs/bank-payment-rehearsal/zelle-automatic-buyer.jpg', fullPage: true });
    await admin.screenshot({ path: 'outputs/bank-payment-rehearsal/zelle-automatic-staff.jpg', fullPage: true });
  });

  // Known finding, not a passing acceptance claim. This will fail as an
  // "unexpected pass" once the page correctly hides obsolete query banners.
  it.fails('KNOWN FINDING: settled Zelle claim URL must not still say the bank is being checked', async () => {
    const fixture = await submittedRehearsalOrder();
    harness.buyer = fixture.buyer;
    const number = fixture.detail.order.orderNumber;
    const buyer = await newPage('buyer');
    const admin = await newPage('admin');
    await buyer.goto(`${origin}/account/orders/${number}`);
    await buyer.locator('input[name="method"][value="zelle"]').check();
    await submit(buyer, 'pay', {});
    await submit(buyer, 'zelle-claim', { payer_name: 'Synthetic Buyer' });
    await admin.goto(`${origin}/manage/orders/${number}`);
    await submit(admin, 'paid', { reference: 'SYNTHETIC-CLEARED' });
    expect((await getOrderByNumber(number))!.order.paymentStatus).toBe('paid');
    await buyer.reload();
    const text = await buyer.locator('body').innerText();
    expect(text).toContain('Payment is confirmed.');
    await buyer.screenshot({ path: 'outputs/bank-payment-rehearsal/zelle-stale-claim-finding.jpg', fullPage: true });
    expect(text).not.toContain('We are checking Chase');
  });

  for (const method of ['bank_transfer', 'zelle'] as const) {
    for (const expired of [false, true]) {
      it(`${method}: buyer/staff payment forms, ${expired ? 'expired stock' : 'cleared payment'}, zero/partial/full refunds`, async () => {
        const fixture = await submittedRehearsalOrder(2);
        harness.buyer = fixture.buyer;
        const { orderNumber: number, id, totalCents } = fixture.detail.order;
        const total = (totalCents / 100).toFixed(2);
        const buyer = await newPage('buyer');
        const admin = await newPage('admin');
        const ops = await newPage('ops');
        const buyerUrl = `${origin}/account/orders/${number}`;
        const staffUrl = `${origin}/manage/orders/${number}`;
        const paidPath = `/api/manage/orders/${number}/paid`;
        const refundPath = `/api/manage/orders/${number}/refund`;
        const current = async () => (await getOrderByNumber(number))!.order;
        const text = (page: Page) => page.locator('body').innerText();

        await buyer.goto(buyerUrl);
        await buyer.locator(`input[name="method"][value="${method}"]`).check();
        await submit(buyer, 'pay', {});
        let body = await text(buyer);
        expect(body).toContain(`$${total}`);
        expect(body).toContain(number);
        expect(body).toContain(method === 'zelle' ? 'recipient@example.invalid' : 'SYNTHETIC BANK ONLY');
        if (method === 'bank_transfer') {
          expect(body).toContain(`Amount: ${total} USD`);
          expect(body).toContain(`Reference: ${number}`);
          expect(body).toContain('Selecting this method does not debit your account.');
        } else {
          await submit(buyer, 'zelle-claim', { payer_name: 'Synthetic bank sender' });
          expect(await text(buyer)).toContain('Your order remains unpaid until we confirm receipt');
          expect((await current()).paymentStatus).toBe('pending');
          expect((await directPost(buyer, `/api/orders/${number}/zelle-claim`, { payer_name: 'Synthetic bank sender' })).status()).toBe(303);
          expect(local.sqlite.prepare('SELECT COUNT(*) AS n FROM zelle_payment_claims WHERE order_id = ?').get(id)?.n).toBe(1);
        }
        await admin.goto(staffUrl);
        await ops.goto(staffUrl);
        expect(await ops.locator('form[action$="/paid"]').count()).toBe(0);
        expect((await directPost(ops, paidPath, { reference: 'SYNTHETIC-CLEARED' })).status()).toBe(403);
        expect((await directPost(buyer, paidPath, { reference: 'SYNTHETIC-CLEARED' })).status()).toBe(401);
        expect((await directPost(admin, paidPath, { reference: 'SYNTHETIC-CLEARED' }, true)).status()).toBe(403);
        const missing = await directPost(admin, paidPath, {});
        expect(missing.headers().location).toContain('error=');
        expect((await current()).paymentStatus).toBe('pending');
        if (expired) local.sqlite.prepare('UPDATE inventory_reservations SET expires_at = 1 WHERE order_id = ?').run(id);
        await submit(admin, 'paid', { reference: `SYNTHETIC-CLEARED-${method}` });
        if (expired) {
          expect(await text(admin)).toContain('A full refund is now due and nothing may be shipped.');
          expect((await current()).status).toBe('cancelled');
        } else {
          expect((await current()).paymentStatus).toBe('paid');
          await buyer.reload();
          expect(await text(buyer)).toContain('Payment is confirmed.');
          await submit(admin, 'cancel', { reason: 'Synthetic rehearsal cancellation' });
        }
        expect((await current()).paymentStatus).toBe('refund_due');
        const beforeRetry = local.sqlite.prepare('SELECT COUNT(*) AS n FROM order_events WHERE order_id = ?').get(id)?.n;
        await directPost(admin, paidPath, { reference: `SYNTHETIC-CLEARED-${method}` });
        expect(local.sqlite.prepare('SELECT COUNT(*) AS n FROM order_events WHERE order_id = ?').get(id)?.n).toBe(beforeRetry);
        expect((await current()).paymentStatus).toBe('refund_due');
        await buyer.reload();
        expect(await text(buyer)).toContain('No refund has been sent yet.');
        expect(await text(buyer)).toContain(`Remaining amount of $${total} awaits a manual refund.`);
        expect(await text(admin)).toContain(`$0.00 sent of $${total} owed`);
        await buyer.screenshot({ path: `outputs/bank-payment-rehearsal/${method}-${expired ? 'expired' : 'cleared'}-zero-buyer.jpg`, fullPage: true });
        await admin.screenshot({ path: `outputs/bank-payment-rehearsal/${method}-${expired ? 'expired' : 'cleared'}-zero-staff.jpg`, fullPage: true });
        await ops.reload();
        expect(await ops.locator('form[action$="/refund"]').count()).toBe(0);
        expect((await directPost(ops, refundPath, { amount: total, reference: 'SYNTHETIC-REFUND' })).status()).toBe(403);
        expect((await directPost(buyer, refundPath, { amount: total, reference: 'SYNTHETIC-REFUND' })).status()).toBe(401);
        for (const amount of ['0', ((totalCents + 1) / 100).toFixed(2)]) {
          expect((await directPost(admin, refundPath, { amount, reference: 'SYNTHETIC-INVALID' })).headers().location).toContain('error=');
          expect((await current()).refundCents ?? 0).toBe(0);
        }
        const partialCents = Math.floor(totalCents / 2);
        const partial = (partialCents / 100).toFixed(2);
        const remaining = ((totalCents - partialCents) / 100).toFixed(2);
        await submit(admin, 'refund', { amount: partial, reference: 'SYNTHETIC-REFUND-1' });
        await buyer.reload();
        expect(await text(buyer)).toContain(`Refund: $${partial} sent`);
        expect(await text(buyer)).toContain(`remaining amount of $${remaining} awaits a manual refund.`);
        expect(await text(admin)).toContain(`$${partial} sent of $${total} owed`);
        await buyer.screenshot({ path: `outputs/bank-payment-rehearsal/${method}-${expired ? 'expired' : 'cleared'}-partial.jpg`, fullPage: true });
        await admin.screenshot({ path: `outputs/bank-payment-rehearsal/${method}-${expired ? 'expired' : 'cleared'}-partial-staff.jpg`, fullPage: true });
        await submit(admin, 'refund', { amount: remaining, reference: 'SYNTHETIC-REFUND-2' });
        await buyer.reload();
        expect(await text(buyer)).toContain('refund complete.');
        expect(await text(admin)).toContain(`$${total} sent of $${total} owed`);
        expect(await admin.locator('form[action$="/refund"]').count()).toBe(0);
        expect(await admin.locator('form[action$="/fulfil"]').count()).toBe(0);
        expect((await current()).paymentStatus).toBe('refunded');
        expect((await current()).refundCents).toBe(totalCents);
        await buyer.screenshot({ path: `outputs/bank-payment-rehearsal/${method}-${expired ? 'expired' : 'cleared'}-complete-buyer.jpg`, fullPage: true });
        await admin.screenshot({ path: `outputs/bank-payment-rehearsal/${method}-${expired ? 'expired' : 'cleared'}-complete-staff.jpg`, fullPage: true });
        await directPost(admin, refundPath, { amount: remaining, reference: 'SYNTHETIC-REFUND-2' });
        expect((await current()).refundCents).toBe(totalCents);
      });
    }
  }
});