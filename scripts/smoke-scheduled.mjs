import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { Miniflare } from 'miniflare';

// Run after a build and LOCAL migrations. No remote bindings or provider
// credentials: this executes the actual built scheduled handler in workerd.
// Miniflare's assets router in the pinned toolchain has no scheduled handler,
// so bypass that local HTTP-assets router and target the user Worker directly.
const config = JSON.parse(readFileSync('dist/server/wrangler.json', 'utf8'));
const files = readdirSync('dist/server', { recursive: true }).filter((path) => path.endsWith('.js') && path !== 'index.js');
const mf = new Miniflare({
  cf: false,
  unsafeTriggerHandlers: true,
  modules: ['index.js', ...files].map((path) => ({ type: 'ESModule', path: `dist/server/${path}` })),
  compatibilityDate: config.compatibility_date,
  compatibilityFlags: config.compatibility_flags,
  d1Databases: { DB: config.d1_databases.find((binding) => binding.binding === 'DB').database_id },
  d1Persist: '.wrangler/state/v3/d1',
  bindings: { APP_ENV: 'development' },
});
try {
  const response = await fetch(new URL('/cdn-cgi/handler/scheduled', await mf.ready), { signal: AbortSignal.timeout(15000) });
  const outcome = await response.text();
  assert.equal(response.status, 200, `Scheduled handler returned ${response.status}: ${outcome.slice(0, 200)}`);
  assert.equal(outcome, 'ok');
  console.log('Built scheduled handler: PASS (local only; email provider disabled).');
} finally {
  await mf.dispose();
}
