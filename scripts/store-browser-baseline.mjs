import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

const args = process.argv.slice(2);
const origin = valueOf('--base-url') ?? 'http://127.0.0.1:5000';
const productPath =
  valueOf('--product') ?? '/catalog/synthetic-baseline-material';
const chromium = process.env.CHROMIUM_PATH ?? 'chromium';

let parsedOrigin;
try {
  parsedOrigin = new URL(origin);
} catch {
  fail('--base-url must be a valid URL.');
}

const productUrl = new URL(productPath, parsedOrigin);
if (
  productUrl.origin !== parsedOrigin.origin ||
  !productUrl.pathname.startsWith('/catalog/')
) {
  fail('--product must be a catalog path on the same origin as --base-url.');
}

const userData = await mkdtemp(join(tmpdir(), 'nexphase-store-browser-'));
let browser;
let socket;
try {
  const page = await launchBrowser(productUrl.href, userData, chromium);
  browser = page.browser;
  socket = page.socket;
  const evaluate = page.evaluate;

  await waitFor(
    async () => (await evaluate('document.readyState')) === 'complete',
    'the product page to finish loading',
  );
  await waitFor(
    async () =>
      Boolean(
        await evaluate(`Boolean(document.querySelector('[role="dialog"]'))`),
      ),
    'the research-use gate to appear',
  );

  const before = await evaluate(`({
    title: document.title,
    heading: document.querySelector('h1')?.innerText ?? '',
    dialog: document.querySelector('[role="dialog"]')?.innerText ?? '',
  })`);
  if (!before.heading || !before.dialog.includes('Before you enter')) {
    fail(
      'the seeded product page did not show the expected product and research-use gate.',
    );
  }

  await evaluate(`document.querySelector('[role="dialog"] button')?.click()`);
  await waitFor(
    async () =>
      !(await evaluate(`Boolean(document.querySelector('[role="dialog"]'))`)),
    'the research-use gate to close after acceptance',
  );

  const after = await evaluate(`({
    heading: document.querySelector('h1')?.innerText ?? '',
    cookie: document.cookie,
    boundary: document.body.innerText.includes('Prices and lot availability are shown to research accounts.'),
    signUp: Boolean(document.querySelector('a[href="/account/sign-up"]')),
    prices: document.body.innerText.match(/\\$\\s?\\d[\\d,]*(?:\\.\\d{2})?/g) ?? [],
  })`);
  if (!after.heading)
    fail(
      'the product page was not usable after accepting the research-use gate.',
    );
  if (!after.boundary || !after.signUp) {
    fail(
      'the anonymous account boundary was not visible after accepting the research-use gate.',
    );
  }
  if (after.prices.length > 0) {
    fail(
      `anonymous visitors saw a dollar price after accepting the research-use gate: ${after.prices.join(', ')}`,
    );
  }
  if (!/(^|;\s*)nx_entry=1(?:;|$)/.test(after.cookie)) {
    fail(
      'accepting the research-use gate did not set the browser entry cookie.',
    );
  }

  console.log(
    JSON.stringify({
      ok: true,
      route: productUrl.pathname,
      product: after.heading,
      gate: 'accepted',
      anonymousPricing: 'account-required',
      visibleDollarPrices: after.prices,
    }),
  );
} finally {
  socket?.close();
  if (browser) {
    browser.kill('SIGTERM');
    await new Promise((resolve) => browser.once('close', resolve));
  }
  await rm(userData, {
    recursive: true,
    force: true,
    maxRetries: 3,
    retryDelay: 100,
  });
}

async function launchBrowser(url, userData, executable) {
  const browser = spawn(
    executable,
    [
      '--headless=new',
      '--no-sandbox',
      '--disable-gpu',
      '--disable-dev-shm-usage',
      '--disable-extensions',
      '--disable-default-apps',
      '--no-first-run',
      '--no-default-browser-check',
      '--remote-debugging-port=0',
      `--user-data-dir=${userData}`,
      url,
    ],
    { stdio: ['ignore', 'ignore', 'pipe'] },
  );
  let stderr = '';
  browser.stderr.on('data', (chunk) => {
    stderr += chunk.toString();
  });

  const startedAt = Date.now();
  let debugUrl;
  while (!debugUrl && Date.now() - startedAt < 10_000) {
    debugUrl = stderr.match(/DevTools listening on (ws:\/\/[^\s]+)/)?.[1];
    if (!debugUrl) await delay(100);
  }
  if (!debugUrl) {
    browser.kill('SIGTERM');
    fail(
      `Chromium did not start: ${stderr.trim() || 'no DevTools endpoint was reported.'}`,
    );
  }

  const endpoint = new URL(debugUrl);
  const pages = await (await fetch(`http://${endpoint.host}/json/list`)).json();
  const target = pages.find((item) => item.type === 'page');
  if (!target?.webSocketDebuggerUrl)
    fail('Chromium did not expose a page target.');

  const socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve, { once: true });
    socket.addEventListener('error', reject, { once: true });
  });

  let nextId = 1;
  const pending = new Map();
  socket.addEventListener('message', (event) => {
    const message = JSON.parse(event.data);
    const resolve = pending.get(message.id);
    if (!resolve) return;
    pending.delete(message.id);
    if (message.error) {
      resolve(Promise.reject(new Error(JSON.stringify(message.error))));
    } else {
      resolve(message.result);
    }
  });

  function command(method, params = {}) {
    return new Promise((resolve, reject) => {
      const id = nextId++;
      pending.set(id, (result) => {
        if (result?.then) {
          result.catch(reject);
        } else {
          resolve(result);
        }
      });
      socket.send(JSON.stringify({ id, method, params }));
    });
  }

  async function evaluate(expression) {
    const result = await command('Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise: true,
    });
    if (result?.exceptionDetails) {
      throw new Error(
        result.exceptionDetails.exception?.description ??
          result.exceptionDetails.text ??
          'Chromium evaluation failed.',
      );
    }
    return result?.result?.value;
  }

  return { browser, socket, evaluate };
}

async function waitFor(check, description) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < 15_000) {
    if (await check()) return;
    await delay(250);
  }
  fail(`timed out waiting for ${description}.`);
}

function valueOf(flag) {
  const index = args.indexOf(flag);
  return index === -1 ? undefined : args[index + 1];
}

function fail(message) {
  console.error(`Store browser baseline: ${message}`);
  process.exitCode = 1;
  throw new Error(message);
}
