import { ORDER_NUMBER_PATTERN } from '@/lib/order-rules';

export const ZELLE_PARSER_VERSION = '2026-09-14.1';

export type GmailHeader = { name?: unknown; value?: unknown };
export type ZelleGmailMessage = {
  id: string;
  threadId?: string;
  internalDate?: string;
  headers: GmailHeader[];
  text: string;
};

export type ParsedZelleReceipt = {
  sourceMessageId: string;
  sourceThreadId: string | null;
  sender: string;
  recipient: string;
  authentication: 'verified' | 'failed' | 'unknown';
  completion: 'received' | 'negative' | 'unknown';
  amountCents: number | null;
  currency: 'USD';
  payerName: string | null;
  memo: string | null;
  orderNumber: string | null;
  occurredAt: Date | null;
  parserVersion: string;
};

function headerValues(headers: GmailHeader[], name: string): string[] {
  return headers
    .filter(
      (header) =>
        typeof header.name === 'string' &&
        header.name.toLowerCase() === name.toLowerCase() &&
        typeof header.value === 'string',
    )
    .map((header) => String(header.value).trim())
    .filter(Boolean);
}

function address(value: string): string {
  const angle = value.match(/<([^<>\s]+@[^<>\s]+)>/u)?.[1];
  const plain = value.match(/[^\s<>,;]+@[^\s<>,;]+/u)?.[0];
  return (angle ?? plain ?? '').toLowerCase();
}

function unique<T>(values: T[]): T[] {
  return [...new Set(values)];
}

function parseAmount(text: string): number | null {
  const dollars = [...text.matchAll(/\$\s*([0-9]{1,9}(?:,[0-9]{3})*(?:\.[0-9]{2})?)/gu)]
    .map((match) => match[1].replaceAll(',', ''))
    .filter((value) => /^\d+(?:\.\d{2})?$/u.test(value))
    .map((value) => Math.round(Number(value) * 100))
    .filter((value) => Number.isSafeInteger(value) && value > 0);
  const amounts = unique(dollars);
  return amounts.length === 1 ? amounts[0] : null;
}

function parseOrderNumber(text: string): string | null {
  const values = unique(
    (text.toUpperCase().match(/NX-\d{6}-\d{4}/gu) ?? []).filter((value) =>
      ORDER_NUMBER_PATTERN.test(value),
    ),
  );
  return values.length === 1 ? values[0] : null;
}

function clean(value: string | undefined, max = 120): string | null {
  const normalized = String(value ?? '')
    .replace(/\s+/gu, ' ')
    .trim()
    .slice(0, max);
  return normalized || null;
}

export function parseZelleGmailMessage(
  message: ZelleGmailMessage,
  config: { recipientEmail: string; senders: string[] },
): ParsedZelleReceipt {
  const from = address(headerValues(message.headers, 'from')[0] ?? '');
  const recipients = unique(
    ['delivered-to', 'x-original-to', 'to', 'x-forwarded-to']
      .flatMap((name) => headerValues(message.headers, name))
      .flatMap((value) => value.split(','))
      .map(address)
      .filter(Boolean),
  );
  const expectedRecipient = config.recipientEmail.toLowerCase();
  const recipient = recipients.includes(expectedRecipient)
    ? expectedRecipient
    : (recipients[0] ?? '');
  const trustedAuthenticationResults = headerValues(
    message.headers,
    'authentication-results',
  ).filter((value) => /^\s*mx\.google\.com\s*;/iu.test(value));
  const authenticationResults =
    trustedAuthenticationResults.length === 1
      ? trustedAuthenticationResults[0].toLowerCase()
      : '';
  const senderAllowed = config.senders
    .map((value) => value.toLowerCase())
    .includes(from);
  const recipientAllowed = recipients.includes(expectedRecipient);
  const hasAuth = trustedAuthenticationResults.length > 0;
  const senderDomain = from.split('@')[1] ?? '';
  const escapedSenderDomain = senderDomain.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
  const authPassed =
    /\bdkim=pass\b/u.test(authenticationResults) &&
    /\bdmarc=pass\b/u.test(authenticationResults) &&
    !/\bdkim=(?:fail|neutral|temperror|permerror)\b/u.test(authenticationResults) &&
    !/\bdmarc=(?:fail|temperror|permerror)\b/u.test(authenticationResults) &&
    Boolean(
      escapedSenderDomain &&
        new RegExp(`\\bheader\\.from=${escapedSenderDomain}\\b`, 'u').test(
          authenticationResults,
        ),
    );
  const authentication =
    senderAllowed && recipientAllowed && authPassed
      ? 'verified'
      : hasAuth || from || recipient
        ? 'failed'
        : 'unknown';

  const subject = headerValues(message.headers, 'subject')[0] ?? '';
  const searchable = `${subject}\n${message.text}`.slice(0, 100_000);
  const statusText = `${subject}\n${message.text.slice(0, 2_000)}`;
  const lower = searchable.toLowerCase();
  const statusLower = statusText.toLowerCase();
  const mentionsZelle = lower.includes('zelle');
  const negative =
    /\b(?:payment|zelle\s+(?:payment|transfer|request))\s+(?:is|was|has been\s+)?(?:pending|failed|declined|cancelled|canceled|reversed)\b/u.test(
      statusLower,
    ) || /\brequested\s+(?:money|payment)\b/u.test(statusLower);
  const received =
    mentionsZelle &&
    /\b(received|sent you|money from|payment from|paid you|deposited)\b/u.test(
      statusLower,
    );
  const completion = negative ? 'negative' : received ? 'received' : 'unknown';
  const orderNumber = parseOrderNumber(searchable);
  const memoMatch = searchable.match(
    /(?:memo|message|note|reference)\s*[:-]\s*([^\r\n]{1,160})/iu,
  );
  const payerMatch = searchable.match(
    /(?:received(?: money)?|payment)\s+(?:of\s+\$[^\s]+\s+)?from\s+([^\r\n,.]{2,120})/iu,
  );
  const internalMs = Number(message.internalDate);
  const occurredAt = Number.isFinite(internalMs) && internalMs > 0
    ? new Date(internalMs)
    : null;

  return {
    sourceMessageId: message.id,
    sourceThreadId: clean(message.threadId, 200),
    sender: from,
    recipient,
    authentication,
    completion,
    amountCents: parseAmount(searchable),
    currency: 'USD',
    payerName: clean(payerMatch?.[1]),
    memo: clean(memoMatch?.[1], 160) ?? orderNumber,
    orderNumber,
    occurredAt,
    parserVersion: ZELLE_PARSER_VERSION,
  };
}
