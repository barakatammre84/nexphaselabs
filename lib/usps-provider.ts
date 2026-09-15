import { env } from 'cloudflare:workers';
import { boundedJson } from '@/lib/provider-response';
import type { ShippingAddress } from '@/lib/shipping-provider';
import type { Parcel, ShippingRate } from '@/lib/shipping-rates';

/**
 * Direct USPS integration against the USPS APIs v3 platform.
 *
 * Why this exists alongside the Shippo path: USPS is the only carrier that
 * collects from a PO Box origin, and buying postage from USPS directly removes
 * a reseller from the middle of a regulated shipment record. The trade is that
 * USPS gates label purchase behind an Enterprise Payment System (EPS) account
 * and a separate USPS Ship enrolment, so rating and tracking come alive long
 * before labels do. Every function below fails closed and says which of the two
 * it is waiting on rather than pretending a label was bought.
 *
 * Three USPS behaviours drive the shape of this file:
 *
 *  1. USPS does not mint rate identifiers. A price search returns prices, not
 *     something you can later buy. The label request restates the whole parcel.
 *     So a rate id here is a compact, self-describing encoding of the exact
 *     rate ingredients (mail class, rate indicator, processing category, both
 *     ZIPs, weight, dimensions, quoted cents) that the purchase step decodes.
 *     It is written to and read back from our own fulfillment_quotes row and
 *     never round-trips through a browser.
 *  2. Label creation is NOT idempotent. USPS will happily sell the same parcel
 *     twice. X-Idempotency-Key is what makes a retry safe and is also the only
 *     handle for reprint and cancellation, so the caller's durable label-claim
 *     row id is reused as that key rather than a fresh random value.
 *  3. The label comes back as bytes, not a hosted URL. They are written to the
 *     private R2 bucket and referenced as `r2:<key>`; nothing is ever public.
 */

const LIVE_HOST = 'https://apis.usps.com';
const TEST_HOST = 'https://apis-tem.usps.com';

/** Mail classes this business ships. Service tokens match SHIPPING_ALLOWED_SERVICES. */
const MAIL_CLASSES = {
  USPS_GROUND_ADVANTAGE: {
    code: 'GA',
    service: 'usps_ground_advantage',
    name: 'USPS Ground Advantage',
    fallbackDays: 5,
  },
  PRIORITY_MAIL: {
    code: 'PM',
    service: 'usps_priority',
    name: 'Priority Mail',
    fallbackDays: 3,
  },
  PRIORITY_MAIL_EXPRESS: {
    code: 'PME',
    service: 'usps_priority_express',
    name: 'Priority Mail Express',
    fallbackDays: 1,
  },
} as const;

type MailClass = keyof typeof MAIL_CLASSES;
const MAIL_CLASS_BY_CODE = new Map<string, MailClass>(
  (Object.keys(MAIL_CLASSES) as MailClass[]).map((key) => [
    MAIL_CLASSES[key].code,
    key,
  ]),
);

const PROCESSING_CATEGORIES = {
  M: 'MACHINABLE',
  N: 'NONSTANDARD',
} as const;
type ProcessingCode = keyof typeof PROCESSING_CATEGORIES;

const DEFAULT_MAIL_CLASSES: MailClass[] = [
  'USPS_GROUND_ADVANTAGE',
  'PRIORITY_MAIL',
];

/* ------------------------------------------------------------------------ */
/* Configuration                                                             */
/* ------------------------------------------------------------------------ */

export function uspsConfiguration() {
  const issues: string[] = [];
  const test = env.APP_ENV === 'staging' || env.APP_ENV === 'development';
  /**
   * Staging talks to the USPS test environment by default. Credentials issued
   * in the Customer Onboarding Portal are not always enabled there, and pricing
   * calls spend nothing, so a deployment may point staging at the live host to
   * prove a real quote. Only the two USPS hosts are accepted; this is never a
   * free-form URL.
   */
  const requestedHost = (env.USPS_API_HOST ?? '').trim();
  if (requestedHost && requestedHost !== LIVE_HOST && requestedHost !== TEST_HOST)
    issues.push('USPS_API_HOST must be the USPS live or test API host.');
  const host = requestedHost === LIVE_HOST || requestedHost === TEST_HOST
    ? requestedHost
    : test
      ? TEST_HOST
      : LIVE_HOST;

  const clientId = (env.USPS_CLIENT_ID ?? '').trim();
  const clientSecret = (env.USPS_CLIENT_SECRET ?? '').trim();
  if (!/^[A-Za-z0-9._~-]{16,256}$/.test(clientId))
    issues.push('Configure the USPS consumer key (USPS_CLIENT_ID).');
  if (!/^[A-Za-z0-9._~-]{16,256}$/.test(clientSecret))
    issues.push('Configure the USPS consumer secret (USPS_CLIENT_SECRET).');

  const crid = (env.USPS_CRID ?? '').trim();
  const mid = (env.USPS_MID ?? '').trim();
  const manifestMid = (env.USPS_MANIFEST_MID ?? mid).trim();
  const accountNumber = (env.USPS_EPS_ACCOUNT_NUMBER ?? '').trim();
  if (!/^\d{4,15}$/.test(crid))
    issues.push('Configure the USPS Customer Registration ID (USPS_CRID).');
  if (!/^\d{6,9}$/.test(mid))
    issues.push('Configure the USPS Mailer ID (USPS_MID).');
  if (!/^\d{6,9}$/.test(manifestMid))
    issues.push('Configure the USPS manifest Mailer ID (USPS_MANIFEST_MID).');

  /**
   * Labels are the only operation that spends money, and USPS refuses them
   * without a funded EPS account. Rating and tracking deliberately do not
   * require it, so this is reported separately instead of as a blanket
   * "USPS is not configured".
   */
  const labelsReady = /^\d{4,20}$/.test(accountNumber);

  const mailClasses = (env.USPS_MAIL_CLASSES ?? '')
    .split(',')
    .map((value) => value.trim().toUpperCase())
    .filter(Boolean)
    .filter((value): value is MailClass => value in MAIL_CLASSES);
  const classes = mailClasses.length ? mailClasses : DEFAULT_MAIL_CLASSES;
  if (classes.length > 4)
    issues.push('Limit USPS_MAIL_CLASSES to four mail classes.');

  const processingCode: ProcessingCode =
    env.USPS_PROCESSING_CATEGORY === 'NONSTANDARD' ? 'N' : 'M';

  return {
    issues,
    test,
    host,
    clientId,
    clientSecret,
    crid,
    mid,
    manifestMid,
    accountNumber,
    labelsReady,
    classes,
    processingCode,
    /** Cache key: any credential change must invalidate a held token. */
    fingerprint: `${host}|${clientId}|${crid}|${mid}|${manifestMid}|${accountNumber}`,
  };
}

type UspsConfiguration = ReturnType<typeof uspsConfiguration>;

/* ------------------------------------------------------------------------ */
/* Tokens                                                                    */
/* ------------------------------------------------------------------------ */

type CachedToken = { value: string; expiresAt: number; fingerprint: string };

let accessTokenCache: CachedToken | null = null;
let paymentTokenCache: CachedToken | null = null;

function live(cache: CachedToken | null, fingerprint: string): string | null {
  return cache &&
    cache.fingerprint === fingerprint &&
    cache.expiresAt > Date.now()
    ? cache.value
    : null;
}

/** A bearer token good for every USPS call. Cached per isolate, never logged. */
async function accessToken(
  configuration: UspsConfiguration,
): Promise<{ ok: true; token: string } | { ok: false; error: string }> {
  const cached = live(accessTokenCache, configuration.fingerprint);
  if (cached) return { ok: true, token: cached };
  let response: Response;
  try {
    response = await fetch(`${configuration.host}/oauth2/v3/token`, {
      method: 'POST',
      signal: AbortSignal.timeout(15_000),
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        client_id: configuration.clientId,
        client_secret: configuration.clientSecret,
        grant_type: 'client_credentials',
      }),
    });
  } catch {
    return { ok: false, error: 'USPS could not be reached for authorisation.' };
  }
  if (!response.ok)
    return {
      ok: false,
      error:
        response.status === 401 || response.status === 403
          ? 'USPS rejected the consumer key and secret. Check the app credentials in the USPS developer portal.'
          : `USPS authorisation returned ${response.status}.`,
    };
  let payload: unknown;
  try {
    payload = await boundedJson(response, 32 * 1024);
  } catch {
    return { ok: false, error: 'USPS authorisation response was unreadable.' };
  }
  const body = asRecord(payload);
  const token = typeof body.access_token === 'string' ? body.access_token : '';
  const seconds =
    typeof body.expires_in === 'number' && Number.isFinite(body.expires_in)
      ? body.expires_in
      : 0;
  if (!token || token.length > 8_192 || seconds <= 60)
    return { ok: false, error: 'USPS returned an unusable access token.' };
  accessTokenCache = {
    value: token,
    // Retire the token two minutes early so an in-flight label never fails on expiry.
    expiresAt: Date.now() + (seconds - 120) * 1_000,
    fingerprint: configuration.fingerprint,
  };
  return { ok: true, token };
}

/**
 * Authorises this CRID/MID pair to spend from the EPS account. USPS requires
 * the resulting token on every label, cancellation and edit request.
 */
async function paymentToken(
  configuration: UspsConfiguration,
  bearer: string,
): Promise<{ ok: true; token: string } | { ok: false; error: string }> {
  const cached = live(paymentTokenCache, configuration.fingerprint);
  if (cached) return { ok: true, token: cached };
  const role = {
    CRID: configuration.crid,
    MID: configuration.mid,
    manifestMID: configuration.manifestMid,
    accountType: 'EPS',
    accountNumber: configuration.accountNumber,
  };
  let response: Response;
  try {
    response = await fetch(
      `${configuration.host}/payments/v3/payment-authorization`,
      {
        method: 'POST',
        signal: AbortSignal.timeout(20_000),
        headers: {
          Authorization: `Bearer ${bearer}`,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({
          roles: [
            { roleName: 'PAYER', ...role },
            { roleName: 'LABEL_OWNER', ...role },
          ],
        }),
      },
    );
  } catch {
    return {
      ok: false,
      error: 'USPS could not be reached for payment authorisation.',
    };
  }
  if (!response.ok)
    return {
      ok: false,
      error:
        response.status === 400 || response.status === 403
          ? 'USPS refused the payment authorisation. Confirm the EPS account is active and that this CRID is enrolled in USPS Ship.'
          : `USPS payment authorisation returned ${response.status}.`,
    };
  let payload: unknown;
  try {
    payload = await boundedJson(response, 64 * 1024);
  } catch {
    return { ok: false, error: 'USPS payment authorisation was unreadable.' };
  }
  const body = asRecord(payload);
  const token =
    typeof body.paymentAuthorizationToken === 'string'
      ? body.paymentAuthorizationToken
      : '';
  if (!token || token.length > 8_192)
    return { ok: false, error: 'USPS returned no payment authorisation token.' };
  paymentTokenCache = {
    value: token,
    // USPS payment tokens outlive this, but a short cache keeps a revoked
    // account from being discovered only at the next label purchase.
    expiresAt: Date.now() + 25 * 60_000,
    fingerprint: configuration.fingerprint,
  };
  return { ok: true, token };
}

/** Drops cached tokens. Used when USPS rejects a token we believed was valid. */
function forgetTokens() {
  accessTokenCache = null;
  paymentTokenCache = null;
}

/* ------------------------------------------------------------------------ */
/* Value helpers                                                             */
/* ------------------------------------------------------------------------ */

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

/** USPS prices arrive as JSON numbers. Convert exactly or refuse. */
export function priceToCents(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0)
    return null;
  if (value > 100_000) return null;
  const cents = Math.round(value * 100);
  // Guard against a price carrying sub-cent precision we would silently drop.
  if (Math.abs(value * 100 - cents) > 0.01) return null;
  return cents > 0 ? cents : null;
}

function hundredths(value: number): number | null {
  if (!Number.isFinite(value) || value <= 0) return null;
  const scaled = Math.round(value * 100);
  return scaled > 0 && scaled <= 99_999 ? scaled : null;
}

function zip5(value: string): string | null {
  const match = /^(\d{5})(?:-\d{4})?$/.exec(value.trim());
  return match ? match[1] : null;
}

/**
 * USPS needs a first and last name, or a firm. A consignee is one free-text
 * string here, so the last whitespace-separated word becomes the surname and
 * everything before it the given name. A single-word name is repeated rather
 * than left blank, because USPS rejects an empty lastName outright.
 */
export function splitConsigneeName(name: string): {
  firstName: string;
  lastName: string;
} {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return { firstName: '', lastName: '' };
  if (parts.length === 1)
    return { firstName: parts[0].slice(0, 60), lastName: parts[0].slice(0, 60) };
  const lastName = parts[parts.length - 1];
  return {
    firstName: parts.slice(0, -1).join(' ').slice(0, 60),
    lastName: lastName.slice(0, 60),
  };
}

/** Our label-claim ids are `sl_` + 32 hex, which is exactly a UUID's payload. */
export function idempotencyKeyFromLabelId(labelId: string): string | null {
  const match = /^[a-z]{2}_([0-9a-f]{32})$/.exec(labelId);
  if (!match) return null;
  const hex = match[1];
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/* ------------------------------------------------------------------------ */
/* Rate identifiers                                                          */
/* ------------------------------------------------------------------------ */

export type UspsRateParts = {
  mailClass: MailClass;
  rateIndicator: string;
  processingCode: ProcessingCode;
  originZIPCode: string;
  destinationZIPCode: string;
  weightHundredths: number;
  lengthHundredths: number;
  widthHundredths: number;
  heightHundredths: number;
  cents: number;
};

export function encodeUspsRateId(parts: UspsRateParts): string {
  return [
    'usps',
    MAIL_CLASSES[parts.mailClass].code,
    parts.rateIndicator,
    parts.processingCode,
    parts.originZIPCode,
    parts.destinationZIPCode,
    parts.weightHundredths,
    parts.lengthHundredths,
    parts.widthHundredths,
    parts.heightHundredths,
    parts.cents,
  ].join('-');
}

export function decodeUspsRateId(rateId: string): UspsRateParts | null {
  const segments = rateId.split('-');
  if (segments.length !== 11 || segments[0] !== 'usps') return null;
  const [, classCode, rateIndicator, processingCode, origin, destination, ...numbers] =
    segments;
  const mailClass = MAIL_CLASS_BY_CODE.get(classCode);
  if (!mailClass) return null;
  if (!/^[A-Z0-9]{1,4}$/.test(rateIndicator)) return null;
  if (processingCode !== 'M' && processingCode !== 'N') return null;
  if (!/^\d{5}$/.test(origin) || !/^\d{5}$/.test(destination)) return null;
  const parsed = numbers.map((value) =>
    /^\d{1,7}$/.test(value) ? Number(value) : Number.NaN,
  );
  if (parsed.some((value) => !Number.isInteger(value) || value <= 0)) return null;
  const [weightHundredths, lengthHundredths, widthHundredths, heightHundredths, cents] =
    parsed;
  return {
    mailClass,
    rateIndicator,
    processingCode,
    originZIPCode: origin,
    destinationZIPCode: destination,
    weightHundredths,
    lengthHundredths,
    widthHundredths,
    heightHundredths,
    cents,
  };
}

/* ------------------------------------------------------------------------ */
/* Rating                                                                    */
/* ------------------------------------------------------------------------ */

function mailingDate(now: Date): string {
  return now.toISOString().slice(0, 10);
}

/**
 * USPS states a delivery window in prose ("2-5 Days"). Customers are promised
 * the far end of it, never the near end, so the largest integer in the string
 * wins and an unparseable commitment falls back to the class default.
 */
function commitmentDays(value: unknown, fallback: number): number {
  const name = typeof value === 'string' ? value : '';
  const numbers = name.match(/\d+/g);
  if (!numbers?.length) return fallback;
  const days = Math.max(...numbers.map(Number));
  return Number.isInteger(days) && days > 0 && days <= 30 ? days : fallback;
}

function ratesFromOptions(
  payload: unknown,
  mailClass: MailClass,
  configuration: UspsConfiguration,
  shipmentId: string,
  parts: Omit<UspsRateParts, 'mailClass' | 'rateIndicator' | 'cents'>,
): ShippingRate[] {
  const options = asRecord(payload).rateOptions;
  if (!Array.isArray(options)) return [];
  const descriptor = MAIL_CLASSES[mailClass];
  const found = new Map<string, ShippingRate>();
  for (const raw of options) {
    const option = asRecord(raw);
    const cents = priceToCents(option.totalBasePrice);
    if (cents === null) continue;
    const detail = asRecord(Array.isArray(option.rates) ? option.rates[0] : null);
    // A mail class we did not ask for must never be sold as one we did.
    if (typeof detail.mailClass === 'string' && detail.mailClass !== mailClass)
      continue;
    const rateIndicator =
      typeof detail.rateIndicator === 'string' &&
      /^[A-Z0-9]{1,4}$/.test(detail.rateIndicator)
        ? detail.rateIndicator
        : null;
    if (!rateIndicator) continue;
    const id = encodeUspsRateId({
      ...parts,
      mailClass,
      rateIndicator,
      cents,
    });
    if (id.length > 120 || found.has(id)) continue;
    found.set(id, {
      id,
      shipmentId,
      accountId: `usps-crid-${configuration.crid}`,
      carrier: 'USPS',
      service: descriptor.service,
      serviceName: descriptor.name,
      cents,
      currency: 'USD',
      estimatedDays: commitmentDays(
        asRecord(detail.commitment).name,
        descriptor.fallbackDays,
      ),
      test: configuration.test,
    });
  }
  return [...found.values()];
}

/** Prices only. No postage is bought and no payment token is requested. */
export async function uspsQuote(
  from: ShippingAddress,
  to: ShippingAddress,
  parcel: Parcel,
  now = new Date(),
) {
  const configuration = uspsConfiguration();
  if (configuration.issues.length)
    return { ok: false as const, error: configuration.issues.join(' ') };
  const origin = zip5(from.zip);
  const destination = zip5(to.zip);
  const weightHundredths = hundredths(parcel.weight);
  const lengthHundredths = hundredths(parcel.length);
  const widthHundredths = hundredths(parcel.width);
  const heightHundredths = hundredths(parcel.height);
  if (
    !origin ||
    !destination ||
    !weightHundredths ||
    !lengthHundredths ||
    !widthHundredths ||
    !heightHundredths
  )
    return {
      ok: false as const,
      error: 'USPS needs five-digit ZIP codes and positive packed dimensions.',
    };

  const bearer = await accessToken(configuration);
  if (!bearer.ok) return { ok: false as const, error: bearer.error };

  const parts = {
    processingCode: configuration.processingCode,
    originZIPCode: origin,
    destinationZIPCode: destination,
    weightHundredths,
    lengthHundredths,
    widthHundredths,
    heightHundredths,
  };
  const shipmentId = `usps-${crypto.randomUUID().replace(/-/g, '')}`;
  /**
   * Commercial pricing is what an EPS account buys. Before that account exists
   * USPS will still quote retail, which is the honest number to show a customer
   * on day one rather than a discount we cannot actually pay.
   */
  const commercial = configuration.labelsReady;
  const base = {
    originZIPCode: origin,
    destinationZIPCode: destination,
    weight: weightHundredths / 100,
    length: lengthHundredths / 100,
    width: widthHundredths / 100,
    height: heightHundredths / 100,
    processingCategory: PROCESSING_CATEGORIES[configuration.processingCode],
    destinationEntryFacilityType: 'NONE',
    priceType: commercial ? 'COMMERCIAL' : 'RETAIL',
    mailingDate: mailingDate(now),
    ...(commercial
      ? { accountType: 'EPS', accountNumber: configuration.accountNumber }
      : {}),
  };

  const responses = await Promise.all(
    configuration.classes.map(async (mailClass) => {
      try {
        const response = await fetch(
          `${configuration.host}/prices/v3/total-rates/search`,
          {
            method: 'POST',
            signal: AbortSignal.timeout(15_000),
            headers: {
              Authorization: `Bearer ${bearer.token}`,
              'Content-Type': 'application/json',
              Accept: 'application/json',
            },
            body: JSON.stringify({ ...base, mailClass }),
          },
        );
        if (response.status === 401 || response.status === 403) {
          forgetTokens();
          return { mailClass, rates: [], status: response.status };
        }
        if (!response.ok)
          return { mailClass, rates: [], status: response.status };
        return {
          mailClass,
          rates: ratesFromOptions(
            await boundedJson(response, 256 * 1024),
            mailClass,
            configuration,
            shipmentId,
            parts,
          ),
          status: 200,
        };
      } catch {
        return { mailClass, rates: [], status: 0 };
      }
    }),
  );

  const rates = responses.flatMap((result) => result.rates);
  if (!rates.length) {
    const status = responses.find((result) => result.status !== 200)?.status;
    return {
      ok: false as const,
      error: status
        ? `USPS returned no priced service for this parcel (${status}). Check the ZIP codes, weight and dimensions.`
        : 'USPS returned no priced service for this parcel.',
    };
  }
  const refused = responses.filter((result) => result.status !== 200);
  return {
    ok: true as const,
    rates,
    test: configuration.test,
    warning: !commercial
      ? 'Retail USPS prices. Commercial pricing begins once the Enterprise Payment System account is active.'
      : refused.length
        ? 'One or more USPS mail classes did not price this parcel. The list below may be incomplete.'
        : null,
  };
}

/* ------------------------------------------------------------------------ */
/* Labels                                                                    */
/* ------------------------------------------------------------------------ */

const LABEL_KEY_PATTERN = /^shipping-labels\/[0-9]{4}\/[a-z0-9_-]{1,80}\.pdf$/;

export function uspsLabelObjectKey(labelId: string, now = new Date()): string {
  return `shipping-labels/${now.getUTCFullYear()}/${labelId}.pdf`;
}

/** `r2:<key>` marks a label whose bytes live in our own private bucket. */
export function labelR2Key(value: unknown): string | null {
  if (typeof value !== 'string' || !value.startsWith('r2:')) return null;
  const key = value.slice(3);
  return LABEL_KEY_PATTERN.test(key) ? key : null;
}

function uspsAddress(address: ShippingAddress, institution?: string | null) {
  const { firstName, lastName } = splitConsigneeName(address.name);
  const zip = zip5(address.zip);
  return {
    ...(institution ? { firm: institution.slice(0, 60) } : {}),
    firstName,
    lastName,
    streetAddress: address.street1.slice(0, 60),
    ...(address.street2 ? { secondaryAddress: address.street2.slice(0, 60) } : {}),
    city: address.city.slice(0, 40),
    state: address.state,
    ZIPCode: zip ?? address.zip.slice(0, 5),
    ...(address.phone ? { phone: address.phone.replace(/\D/g, '').slice(0, 15) } : {}),
    ...(address.email ? { email: address.email.slice(0, 254) } : {}),
  };
}

function decodeBase64(value: string): Uint8Array | null {
  const cleaned = value.trim();
  if (!cleaned || cleaned.length > 8 * 1024 * 1024) return null;
  if (!/^[A-Za-z0-9+/\r\n=]+$/.test(cleaned)) return null;
  try {
    const binary = atob(cleaned.replace(/[\r\n]/g, ''));
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1)
      bytes[index] = binary.charCodeAt(index);
    // Every USPS label image is a PDF here; anything else is not stored.
    return bytes.length > 4 &&
      bytes[0] === 0x25 &&
      bytes[1] === 0x50 &&
      bytes[2] === 0x44 &&
      bytes[3] === 0x46
      ? bytes
      : null;
  } catch {
    return null;
  }
}

export type UspsPurchase =
  | {
      ok: true;
      trackingNumber: string;
      labelUrl: string;
      /** What USPS actually charged, which is not always what was quoted. */
      postageCents: number | null;
      warnings: string[];
      test: boolean;
    }
  | { ok: false; uncertain: boolean; error: string };

/** USPS advisories ride alongside a successful label and are worth keeping. */
function labelWarnings(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .slice(0, 10)
    .map((entry) => {
      const warning = asRecord(entry);
      const code =
        typeof warning.warningCode === 'string' ? warning.warningCode : '';
      const description =
        typeof warning.warningDescription === 'string'
          ? warning.warningDescription
          : '';
      return `${code ? `${code}: ` : ''}${description}`.trim().slice(0, 300);
    })
    .filter(Boolean);
}

/**
 * Buys one label. `labelId` is the caller's durable claim row, reused as the
 * USPS idempotency key so a retry of the same claim cannot buy twice.
 */
export async function uspsPurchaseLabel(
  rateId: string,
  from: ShippingAddress,
  to: ShippingAddress,
  labelId: string,
  institution?: string | null,
  now = new Date(),
): Promise<UspsPurchase> {
  const configuration = uspsConfiguration();
  if (configuration.issues.length)
    return { ok: false, uncertain: false, error: configuration.issues.join(' ') };
  if (!configuration.labelsReady)
    return {
      ok: false,
      uncertain: false,
      error:
        'USPS label purchase needs an Enterprise Payment System account number (USPS_EPS_ACCOUNT_NUMBER) and USPS Ship enrolment. No label was bought.',
    };
  const parts = decodeUspsRateId(rateId);
  if (!parts)
    return { ok: false, uncertain: false, error: 'The selected USPS rate is invalid.' };
  const idempotencyKey = idempotencyKeyFromLabelId(labelId);
  if (!idempotencyKey)
    return {
      ok: false,
      uncertain: false,
      error: 'The label claim reference is invalid; refusing to buy postage without one.',
    };
  if (zip5(from.zip) !== parts.originZIPCode || zip5(to.zip) !== parts.destinationZIPCode)
    return {
      ok: false,
      uncertain: false,
      error: 'The quoted route no longer matches this order. Compare rates again.',
    };
  if (!env.DOCS)
    return {
      ok: false,
      uncertain: false,
      error: 'The document bucket is unavailable, so a purchased label could not be stored.',
    };

  const bearer = await accessToken(configuration);
  if (!bearer.ok) return { ok: false, uncertain: false, error: bearer.error };
  const payment = await paymentToken(configuration, bearer.token);
  if (!payment.ok) return { ok: false, uncertain: false, error: payment.error };

  let response: Response;
  try {
    response = await fetch(`${configuration.host}/labels/v3/label`, {
      method: 'POST',
      signal: AbortSignal.timeout(30_000),
      headers: {
        Authorization: `Bearer ${bearer.token}`,
        'X-Payment-Authorization-Token': payment.token,
        'X-Idempotency-Key': idempotencyKey,
        'Content-Type': 'application/json',
        // One JSON document holding both metadata and the base64 label, instead
        // of the default multipart body a Worker would have to parse by hand.
        Accept: 'application/vnd.usps.labels+json',
      },
      body: JSON.stringify({
        imageInfo: { imageType: 'PDF', labelType: '4X6LABEL', receiptOption: 'NONE' },
        toAddress: uspsAddress(to, institution),
        fromAddress: uspsAddress(from),
        packageDescription: {
          mailClass: parts.mailClass,
          rateIndicator: parts.rateIndicator,
          processingCategory: PROCESSING_CATEGORIES[parts.processingCode],
          weightUOM: 'lb',
          weight: parts.weightHundredths / 100,
          dimensionsUOM: 'in',
          length: parts.lengthHundredths / 100,
          width: parts.widthHundredths / 100,
          height: parts.heightHundredths / 100,
          mailingDate: mailingDate(now),
          extraServices: [],
          destinationEntryFacilityType: 'NONE',
        },
      }),
    });
  } catch {
    return {
      ok: false,
      uncertain: true,
      error:
        'The USPS label request did not complete. Do not retry; check the USPS dashboard for a label on this order.',
    };
  }
  if (response.status === 401 || response.status === 403) forgetTokens();
  if (!response.ok)
    return {
      ok: false,
      // A 4xx means USPS refused and charged nothing. A 5xx may have charged.
      uncertain: response.status >= 500,
      error: `USPS label creation returned ${response.status}. ${
        response.status >= 500
          ? 'Check the USPS dashboard before trying anything else.'
          : 'No postage was bought.'
      }`,
    };

  let payload: unknown;
  try {
    payload = await boundedJson(response, 12 * 1024 * 1024);
  } catch {
    return {
      ok: false,
      uncertain: true,
      error: 'USPS returned a label response we could not read. Reconcile it in the USPS dashboard.',
    };
  }
  /**
   * The `application/vnd.usps.labels+json` body is FLAT: LabelVendorResponse is
   * an allOf over LabelMetadata, so trackingNumber, postage and labelImage sit
   * at the top level. `labelAddress` is the standardised address, not a
   * metadata container — reading postage from it silently yields nothing.
   */
  const body = asRecord(payload);
  const trackingNumber =
    typeof body.trackingNumber === 'string' ? body.trackingNumber.trim() : '';
  const image = typeof body.labelImage === 'string' ? body.labelImage : '';
  const bytes = image ? decodeBase64(image) : null;
  if (!/^[A-Za-z0-9]{10,40}$/.test(trackingNumber) || !bytes)
    return {
      ok: false,
      uncertain: true,
      error:
        'USPS did not return a usable tracking number and label. Reconcile it in the USPS dashboard before retrying.',
    };

  const key = uspsLabelObjectKey(labelId, now);
  try {
    await env.DOCS.put(key, bytes, {
      httpMetadata: { contentType: 'application/pdf' },
    });
  } catch {
    return {
      ok: false,
      uncertain: true,
      error: `USPS sold label ${trackingNumber} but it could not be stored. Recover it from the USPS dashboard; do not buy another.`,
    };
  }
  return {
    ok: true,
    trackingNumber,
    labelUrl: `r2:${key}`,
    postageCents: priceToCents(body.postage),
    warnings: labelWarnings(body.warnings),
    test: configuration.test,
  };
}

export type UspsCancellation =
  | { ok: true; status: 'success' | 'pending'; reference: string }
  | { ok: false; uncertain: boolean; error: string };

/**
 * Cancels an unused label, or opens a refund dispute when USPS has already
 * manifested it. A dispute is reported as pending, never as money returned.
 */
export async function uspsCancelLabel(
  trackingNumber: string,
): Promise<UspsCancellation> {
  const configuration = uspsConfiguration();
  if (configuration.issues.length)
    return { ok: false, uncertain: false, error: configuration.issues.join(' ') };
  if (!configuration.labelsReady)
    return {
      ok: false,
      uncertain: false,
      error: 'USPS label cancellation needs the Enterprise Payment System account number.',
    };
  if (!/^[A-Za-z0-9]{10,40}$/.test(trackingNumber))
    return { ok: false, uncertain: false, error: 'The USPS tracking number is invalid.' };

  const bearer = await accessToken(configuration);
  if (!bearer.ok) return { ok: false, uncertain: false, error: bearer.error };
  const payment = await paymentToken(configuration, bearer.token);
  if (!payment.ok) return { ok: false, uncertain: false, error: payment.error };

  let response: Response;
  try {
    response = await fetch(
      `${configuration.host}/labels/v3/label/${encodeURIComponent(trackingNumber)}`,
      {
        method: 'DELETE',
        signal: AbortSignal.timeout(20_000),
        headers: {
          Authorization: `Bearer ${bearer.token}`,
          'X-Payment-Authorization-Token': payment.token,
          Accept: 'application/json',
        },
      },
    );
  } catch {
    return {
      ok: false,
      uncertain: true,
      error: 'The USPS cancellation outcome is uncertain. Do not retry; check the USPS dashboard.',
    };
  }
  if (response.status === 401 || response.status === 403) forgetTokens();
  if (!response.ok)
    return {
      ok: false,
      uncertain: response.status >= 500,
      error: `USPS cancellation returned ${response.status}. Reconcile the label in the USPS dashboard before another action.`,
    };
  let payload: unknown;
  try {
    payload = await boundedJson(response, 64 * 1024);
  } catch {
    return {
      ok: false,
      uncertain: true,
      error: 'The USPS cancellation response was unreadable. Check the USPS dashboard.',
    };
  }
  const body = asRecord(payload);
  // USPS documents exactly two outcomes: CANCELED (no charge) and DISPUTED
  // (a refund request, identified by disputeId, that a human must chase).
  const status = typeof body.status === 'string' ? body.status.toUpperCase() : '';
  const disputeId = typeof body.disputeId === 'string' ? body.disputeId : '';
  if (status === 'CANCELED' || status === 'CANCELLED')
    return { ok: true, status: 'success', reference: trackingNumber };
  if (status === 'DISPUTED' && /^[A-Za-z0-9_-]{1,120}$/.test(disputeId))
    return { ok: true, status: 'pending', reference: disputeId };
  return {
    ok: false,
    uncertain: true,
    error: 'USPS neither cancelled the label nor opened a refund. Review it in the USPS dashboard.',
  };
}
