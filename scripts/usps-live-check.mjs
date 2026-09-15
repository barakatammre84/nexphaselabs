#!/usr/bin/env node
/**
 * Read-only USPS credential check.
 *
 * Proves three things without spending a cent: the consumer key and secret are
 * accepted, which API products the app actually carries, and that USPS will
 * price a real parcel from our ship-from ZIP. It calls only the OAuth token
 * endpoint and the prices search — never /labels, never /payments — so there is
 * no path from running this to buying postage.
 *
 * The secret is read from .dev.vars (gitignored) or the environment and is
 * never printed, logged or written anywhere.
 *
 *   node scripts/usps-live-check.mjs [destinationZIP]
 */
import { readFileSync } from 'node:fs';

const HOST = 'https://apis.usps.com';

/** Mirrors FLAT_RATE_CONTAINERS in lib/usps-provider.ts. Keep the two in step. */
const CONTAINERS = {
  FS: [[8.625, 5.375, 1.625]],
  FB: [[11, 8.5, 5.5], [13.75, 11.75, 3.25]],
  PL: [[11.875, 11.875, 5.5]],
  PM: [[11.875, 11.875, 5.5]],
  FE: [[12.5, 9.5, 0.75]],
  FA: [[15, 9.5, 0.75]],
  FP: [[12.5, 9.5, 1]],
};
const CONTAINER_NAMES = {
  FS: 'Small Flat Rate Box',
  FB: 'Medium Flat Rate Box',
  PL: 'Large Flat Rate Box',
  PM: 'Large Flat Rate Box (APO/FPO)',
  FE: 'Flat Rate Envelope',
  FA: 'Legal Flat Rate Envelope',
  FP: 'Padded Flat Rate Envelope',
};
const fits = (parcel, shapes) => {
  const sorted = [...parcel].sort((a, b) => b - a);
  return shapes.some((shape) => {
    const capacity = [...shape].sort((a, b) => b - a);
    return sorted.every((side, i) => side <= capacity[i] + 1e-9);
  });
};

function fromDevVars(name) {
  try {
    const line = readFileSync('.dev.vars', 'utf8')
      .split(/\r?\n/)
      .find((row) => row.startsWith(`${name}=`));
    if (!line) return '';
    return line.slice(name.length + 1).trim().replace(/^["']|["']$/g, '');
  } catch {
    return '';
  }
}

function fromWrangler(name) {
  try {
    const match = new RegExp(`"${name}"\\s*:\\s*"([^"]+)"`).exec(
      readFileSync('wrangler.jsonc', 'utf8'),
    );
    return match ? match[1] : '';
  } catch {
    return '';
  }
}

const clientId = process.env.USPS_CLIENT_ID || fromWrangler('USPS_CLIENT_ID');
const clientSecret = process.env.USPS_CLIENT_SECRET || fromDevVars('USPS_CLIENT_SECRET');
const originZIP = fromWrangler('USPS_ORIGIN_ZIP') || '95242';
const destinationZIP = process.argv[2] || '63118';

if (!clientId) {
  console.error('No USPS_CLIENT_ID found in wrangler.jsonc.');
  process.exit(1);
}
if (!clientSecret) {
  console.error(
    'No USPS_CLIENT_SECRET found.\n' +
      'Add this one line to .dev.vars (it is gitignored and stays on this Mac):\n' +
      '  USPS_CLIENT_SECRET=your-consumer-secret\n',
  );
  process.exit(1);
}

console.log(`Consumer key ....... ${clientId.slice(0, 6)}…${clientId.slice(-4)}`);
console.log(`Consumer secret .... present (${clientSecret.length} characters, not shown)`);
console.log(`Host ............... ${HOST}\n`);

const tokenResponse = await fetch(`${HOST}/oauth2/v3/token`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
  body: JSON.stringify({
    client_id: clientId,
    client_secret: clientSecret,
    grant_type: 'client_credentials',
  }),
});

if (!tokenResponse.ok) {
  console.error(`AUTH FAILED — USPS returned ${tokenResponse.status}.`);
  console.error(
    tokenResponse.status === 401 || tokenResponse.status === 400
      ? 'The consumer key and secret were not accepted. Re-copy both from the app in the Customer Onboarding Portal.'
      : 'USPS rejected the request for another reason.',
  );
  process.exit(1);
}

const token = await tokenResponse.json();
console.log('AUTH OK — USPS accepted the credentials.');
console.log(`Token valid for .... ${Math.round((token.expires_in ?? 0) / 3600)} hours`);

/**
 * The scope list is the honest answer to "can we buy labels yet". Labels only
 * appears once USPS has granted USPS Ship against this CRID.
 */
const scopes = String(token.scope ?? '').split(/[\s,]+/).filter(Boolean);
if (scopes.length) {
  console.log(`\nAPI products on this app (${scopes.length}):`);
  for (const scope of scopes.sort()) console.log(`  - ${scope}`);
  const labels = scopes.some((scope) => /label/i.test(scope));
  console.log(
    `\nLabels access ...... ${labels ? 'GRANTED' : 'NOT GRANTED — needs USPS Ship enrolment and an active EPS account'}`,
  );
} else {
  console.log('\nUSPS returned no scope list, so Labels access cannot be read from here.');
}

const base = {
  originZIPCode: originZIP,
  destinationZIPCode: destinationZIP,
  weight: 0.5,
  length: 9,
  width: 6,
  height: 4,
  processingCategory: 'MACHINABLE',
  destinationEntryFacilityType: 'NONE',
  priceType: 'RETAIL',
  mailingDate: new Date().toISOString().slice(0, 10),
};

console.log(`\nPricing a 0.5 lb 9x6x4 parcel, ${originZIP} -> ${destinationZIP}:`);
for (const mailClass of ['USPS_GROUND_ADVANTAGE', 'PRIORITY_MAIL']) {
  const response = await fetch(`${HOST}/prices/v3/total-rates/search`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token.access_token}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({ ...base, mailClass }),
  });
  if (!response.ok) {
    console.log(`  ${mailClass}: FAILED (${response.status}) ${(await response.text()).slice(0, 300)}`);
    continue;
  }
  const payload = await response.json();
  const options = Array.isArray(payload.rateOptions) ? payload.rateOptions : [];
  if (!options.length) {
    console.log(`  ${mailClass}: no priced option returned`);
    continue;
  }
  /**
   * Show every rate USPS offers and mark which ones we could lawfully buy.
   * Flat Rate prices are only valid inside USPS-supplied packaging, so the
   * cheapest number on this list is usually NOT the one to sell.
   */
  const allowed = new Set(
    (fromWrangler('USPS_RATE_INDICATORS') || 'SP').split(',').map((v) => v.trim()),
  );
  for (const option of options) {
    const detail = Array.isArray(option.rates) ? (option.rates[0] ?? {}) : {};
    const indicator = detail.rateIndicator ?? '?';
    const container = CONTAINERS[indicator];
    let verdict;
    if (!allowed.has(indicator)) verdict = 'not stocked';
    else if (container && !fits([base.length, base.width, base.height], container))
      verdict = `will not fit a ${CONTAINER_NAMES[indicator]}`;
    else if (container && base.weight > 70) verdict = 'over the 70 lb flat-rate limit';
    else if (!container && detail.processingCategory !== base.processingCategory)
      verdict = `priced as ${detail.processingCategory}, not ${base.processingCategory}`;
    console.log(
      `  ${verdict ? 'excluded' : 'USABLE  '} $${Number(option.totalBasePrice).toFixed(2).padStart(6)}` +
        `  ${String(indicator).padEnd(3)}` +
        `  ${detail.description ?? mailClass}` +
        `${verdict ? ` — ${verdict}` : ''}`,
    );
  }
}
console.log('\nDone. No label was created and no payment account was contacted.');
