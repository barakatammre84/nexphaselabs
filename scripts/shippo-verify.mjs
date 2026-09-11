#!/usr/bin/env node

import { existsSync, readFileSync } from 'node:fs';
import process from 'node:process';

const ENV_FILE = '.dev.vars';
const SUPPORTED_CARRIERS = new Set(['usps', 'ups', 'fedex']);

function parseEnvFile(path) {
  if (!existsSync(path)) return {};
  const values = {};
  for (const rawLine of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const match = line.match(/^(?:export\s+)?([A-Z][A-Z0-9_]*)=(.*)$/);
    if (!match) continue;
    let value = match[2].trim();
    if (
      value.length >= 2 &&
      ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'")))
    ) {
      value = value.slice(1, -1);
    }
    values[match[1]] = value;
  }
  return values;
}

function safeJson(value) {
  try {
    return JSON.parse(value || 'null');
  } catch {
    return null;
  }
}

function validOrigin(value) {
  const origin = safeJson(value);
  const phoneDigits =
    origin && typeof origin.phone === 'string'
      ? origin.phone.replace(/\D/g, '')
      : '';
  return Boolean(
    origin &&
    typeof origin === 'object' &&
    ['name', 'street1', 'city', 'state', 'zip', 'country'].every(
      (field) => typeof origin[field] === 'string' && origin[field].trim(),
    ) &&
    origin.country === 'US' &&
    phoneDigits.length >= 8 &&
    phoneDigits.length <= 15 &&
    typeof origin.email === 'string' &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(origin.email),
  );
}

function validOriginConfiguration(config) {
  if (!config.SHIPPO_ORIGINS_JSON)
    return validOrigin(config.SHIPPO_FROM_JSON || config.SHIPPING_FROM_JSON);
  const origins = safeJson(config.SHIPPO_ORIGINS_JSON);
  const activeOrigins = Array.isArray(origins)
    ? origins.filter((origin) => origin?.active !== false)
    : [];
  const ids = activeOrigins.map((origin) => origin?.id);
  return Boolean(
    Array.isArray(origins) &&
    origins.length > 0 &&
    origins.length <= 10 &&
    activeOrigins.length > 0 &&
    new Set(ids).size === ids.length &&
    activeOrigins.every(
      (origin) =>
        typeof origin?.id === 'string' &&
        /^[a-z0-9][a-z0-9-]{0,39}$/.test(origin.id) &&
        typeof origin?.label === 'string' &&
        origin.label.trim() &&
        validOrigin(JSON.stringify(origin.address)),
    ),
  );
}

function validParcel(value) {
  const parcel = safeJson(value);
  return Boolean(
    parcel &&
    typeof parcel === 'object' &&
    ['length', 'width', 'height', 'baseWeight', 'perPackWeight'].every(
      (field) => Number.isFinite(parcel[field]) && parcel[field] >= 0,
    ) &&
    parcel.length > 0 &&
    parcel.width > 0 &&
    parcel.height > 0 &&
    parcel.baseWeight > 0,
  );
}

function stop(message) {
  console.error(`Shippo check stopped: ${message}`);
  process.exitCode = 1;
}

const fileValues = parseEnvFile(ENV_FILE);
const config = { ...fileValues, ...process.env };
const key = config.SHIPPO_API_KEY || '';
const mode = key.startsWith('shippo_test_')
  ? 'test'
  : key.startsWith('shippo_live_')
    ? 'live'
    : null;

console.log('Shippo connection check (read-only; no label will be purchased)');

if (!key) {
  stop(
    `SHIPPO_API_KEY is missing from ${ENV_FILE}. Add a Shippo test key locally, then run this command again.`,
  );
} else if (!mode) {
  stop(
    'SHIPPO_API_KEY does not have a recognized shippo_test_ or shippo_live_ prefix.',
  );
} else {
  try {
    const response = await fetch(
      'https://api.goshippo.com/carrier_accounts?service_levels=true&results=100',
      {
        signal: AbortSignal.timeout(15_000),
        headers: {
          Authorization: `ShippoToken ${key}`,
          'SHIPPO-API-VERSION': '2018-02-08',
        },
      },
    );
    if (!response.ok) {
      stop(
        `Shippo returned HTTP ${response.status}. Check that the ${mode} key is active.`,
      );
    } else {
      const contentLength = Number(response.headers.get('content-length') || 0);
      if (contentLength > 1_000_000) {
        stop('Shippo returned an unexpectedly large response.');
      } else {
        const payload = await response.json();
        const accounts = Array.isArray(payload?.results) ? payload.results : [];
        const supported = accounts
          .filter(
            (account) =>
              account &&
              typeof account === 'object' &&
              SUPPORTED_CARRIERS.has(account.carrier) &&
              typeof account.object_id === 'string',
          )
          .map((account) => ({
            carrier: String(
              account.carrier_name || account.carrier,
            ).toUpperCase(),
            mode: account.test === true ? 'test' : 'live',
            active: account.active === true,
            connection:
              account.object_info?.authentication?.status || 'not reported',
            id: account.object_id,
            services: Array.isArray(account.service_levels)
              ? account.service_levels.length
              : 0,
          }));
        const eligible = supported.filter(
          (account) => account.active && account.mode === mode,
        );
        const configuredIds = (config.SHIPPO_CARRIER_ACCOUNTS || '')
          .split(',')
          .map((value) => value.trim())
          .filter(Boolean);
        const eligibleIds = new Set(eligible.map((account) => account.id));
        const invalidIds = configuredIds.filter((id) => !eligibleIds.has(id));

        console.log(`API key accepted: ${mode} mode`);
        if (supported.length) console.table(supported);
        else
          console.log('No USPS, UPS, or FedEx carrier accounts were returned.');

        if (!eligible.length) {
          stop(
            `No active ${mode} USPS, UPS, or FedEx carrier account is available.`,
          );
        } else if (!configuredIds.length) {
          console.log('\nAdd the approved account ID(s) to .dev.vars:');
          console.log(
            `SHIPPO_CARRIER_ACCOUNTS=${eligible.map((account) => account.id).join(',')}`,
          );
        } else if (invalidIds.length) {
          stop(
            `${invalidIds.length} configured carrier account ID(s) are not active in ${mode} mode.`,
          );
        } else {
          console.log(
            `Configured carrier accounts verified: ${configuredIds.length}`,
          );
        }

        console.log('\nLocal application settings:');
        console.log(
          `- SHIPPING_PROVIDER: ${config.SHIPPING_PROVIDER === 'shippo' ? 'ready' : 'set to shippo'}`,
        );
        console.log(
          `- ship-from locations: ${validOriginConfiguration(config) ? 'ready' : 'complete address, sender phone, and sender email required'}`,
        );
        console.log(
          `- SHIPPING_DEFAULT_PARCEL_JSON: ${validParcel(config.SHIPPING_DEFAULT_PARCEL_JSON) ? 'ready' : 'packed dimensions and weights required'}`,
        );
        console.log(
          `- CHECKOUT_QUOTES_REQUIRED: ${config.CHECKOUT_QUOTES_REQUIRED === 'true' ? 'ready' : 'set to true before acceptance testing'}`,
        );
      }
    }
  } catch (error) {
    stop(
      error instanceof Error && error.name === 'TimeoutError'
        ? 'the carrier-account request timed out.'
        : 'the carrier-account request failed.',
    );
  }
}
