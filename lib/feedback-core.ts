import { randomToken, sha256Hex } from '@/lib/staff-auth-core';

export const FEEDBACK_COOKIE = 'nx_feedback';
export const FEEDBACK_MESSAGE_MAX = 2000;
const COOKIE_SECONDS = 180 * 24 * 60 * 60;

export type FeedbackProfile = {
  name: string | null;
  email: string | null;
};

export type FeedbackReport = {
  kind: 'bug' | 'improvement' | 'comment';
  severity: 'blocking' | 'major' | 'minor' | 'suggestion';
  title: string | null;
  expectedBehavior: string | null;
  browserContext: string | null;
};

function boundedContextNumber(value: unknown): number {
  return Math.max(0, Math.min(20_000, Math.round(Number(value) || 0)));
}

function boundedContextText(value: unknown, max: number): string | undefined {
  if (typeof value !== 'string') return undefined;
  const text = value.replace(/\s+/g, ' ').trim();
  return text ? text.slice(0, max) : undefined;
}

function normalizeAnnotation(value: unknown) {
  if (!value || typeof value !== 'object') return undefined;
  const annotation = value as Record<string, unknown>;
  return {
    kind: annotation.kind === 'text' ? ('text' as const) : ('element' as const),
    selector: boundedContextText(annotation.selector, 500),
    label: boundedContextText(annotation.label, 200),
    selectedText: boundedContextText(annotation.selectedText, 500),
    rect:
      annotation.rect && typeof annotation.rect === 'object'
        ? {
            x: boundedContextNumber(
              (annotation.rect as Record<string, unknown>).x,
            ),
            y: boundedContextNumber(
              (annotation.rect as Record<string, unknown>).y,
            ),
            width: boundedContextNumber(
              (annotation.rect as Record<string, unknown>).width,
            ),
            height: boundedContextNumber(
              (annotation.rect as Record<string, unknown>).height,
            ),
          }
        : undefined,
  };
}

export function feedbackToken(request: Request): string | null {
  return (
    (request.headers.get('cookie') ?? '').match(
      /(?:^|;\s*)nx_feedback=([a-f0-9]{64})(?:;|$)/,
    )?.[1] ?? null
  );
}

export function feedbackCookie(token: string, secure: boolean): string {
  return [
    `${FEEDBACK_COOKIE}=${token}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${COOKIE_SECONDS}`,
    secure ? 'Secure' : '',
  ]
    .filter(Boolean)
    .join('; ');
}

export function normalizeFeedbackMessage(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const body = value.replace(/\r\n?/g, '\n').replaceAll('\u0000', '').trim();
  if (!body || body.length > FEEDBACK_MESSAGE_MAX) return null;
  if (body.split('\n').length > 40) return null;
  return body;
}

export function normalizeFeedbackProfile(
  name: unknown,
  email: unknown,
): FeedbackProfile | null {
  const safeName = typeof name === 'string' && name.trim() ? name.trim() : null;
  const safeEmail =
    typeof email === 'string' && email.trim()
      ? email.trim().toLowerCase()
      : null;
  if (
    safeName &&
    (safeName.length > 100 ||
      safeName.includes('\u0000') ||
      safeName.includes('\r') ||
      safeName.includes('\n'))
  )
    return null;
  if (
    safeEmail &&
    (safeEmail.length > 254 ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(safeEmail) ||
      safeEmail.includes('\u0000') ||
      safeEmail.includes('\r') ||
      safeEmail.includes('\n'))
  )
    return null;
  return { name: safeName, email: safeEmail };
}

export function normalizeFeedbackReport(
  input: Record<string, unknown>,
): FeedbackReport | null {
  const kind = ['bug', 'improvement', 'comment'].includes(String(input.kind))
    ? (input.kind as FeedbackReport['kind'])
    : 'comment';
  const suppliedSeverity = String(input.severity ?? '');
  const severity =
    kind === 'bug' && ['blocking', 'major', 'minor'].includes(suppliedSeverity)
      ? (suppliedSeverity as FeedbackReport['severity'])
      : 'suggestion';
  const title = typeof input.title === 'string' ? input.title.trim() : '';
  const expected =
    typeof input.expectedBehavior === 'string'
      ? normalizeFeedbackMessage(input.expectedBehavior)
      : null;
  if (title.length > 100 || (input.expectedBehavior && !expected)) return null;

  let browserContext: string | null = null;
  if (input.context && typeof input.context === 'object') {
    const candidate = input.context as Record<string, unknown>;
    const annotation = normalizeAnnotation(candidate.annotation);
    const annotations = Array.isArray(candidate.annotations)
      ? candidate.annotations
          .slice(0, 5)
          .map(normalizeAnnotation)
          .filter(Boolean)
      : annotation
        ? [annotation]
        : [];
    const safe = {
      userAgent:
        typeof candidate.userAgent === 'string'
          ? candidate.userAgent.slice(0, 500)
          : undefined,
      language:
        typeof candidate.language === 'string'
          ? candidate.language.slice(0, 30)
          : undefined,
      timezone:
        typeof candidate.timezone === 'string'
          ? candidate.timezone.slice(0, 80)
          : undefined,
      viewport:
        candidate.viewport && typeof candidate.viewport === 'object'
          ? {
              width: boundedContextNumber(
                (candidate.viewport as Record<string, unknown>).width,
              ),
              height: boundedContextNumber(
                (candidate.viewport as Record<string, unknown>).height,
              ),
            }
          : undefined,
      scroll:
        candidate.scroll && typeof candidate.scroll === 'object'
          ? {
              x: boundedContextNumber(
                (candidate.scroll as Record<string, unknown>).x,
              ),
              y: boundedContextNumber(
                (candidate.scroll as Record<string, unknown>).y,
              ),
            }
          : undefined,
      devicePixelRatio: Math.max(
        1,
        Math.min(4, Number(candidate.devicePixelRatio) || 1),
      ),
      pageTitle: boundedContextText(candidate.pageTitle, 200),
      annotation: annotations.at(-1),
      annotations,
    };
    browserContext = JSON.stringify(safe);
    if (browserContext.length > 8_000) return null;
  }
  return {
    kind,
    severity,
    title: title || null,
    expectedBehavior: expected,
    browserContext,
  };
}

export function normalizeSourcePath(value: unknown): string {
  if (
    typeof value !== 'string' ||
    !value.startsWith('/') ||
    value.startsWith('//')
  )
    return '/';
  const [withoutHash, rawHash = ''] = value.split('#', 2);
  const path = withoutHash.split('?')[0].slice(0, 300);
  const hash =
    rawHash && /^[A-Za-z0-9_:.~-]{1,100}$/.test(rawHash) ? `#${rawHash}` : '';
  const safePath = `${path}${hash}`;
  return [...safePath].every(
    (character) =>
      character.charCodeAt(0) >= 32 && character.charCodeAt(0) <= 126,
  )
    ? safePath
    : '/';
}

export function feedbackSameOrigin(request: Request): boolean {
  const host = request.headers.get('host') ?? new URL(request.url).host;
  const origin =
    request.headers.get('origin') ?? request.headers.get('referer');
  if (!origin) return false;
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

export function feedbackRequestIsSecure(request: Request): boolean {
  return (
    new URL(request.url).protocol === 'https:' ||
    (request.headers.get('x-forwarded-proto') ?? '').includes('https')
  );
}

export function feedbackPublicId(now = new Date()): string {
  const date = now.toISOString().slice(2, 10).replace(/-/g, '');
  return `FB-${date}-${randomToken().slice(0, 8).toUpperCase()}`;
}

export function feedbackId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID().replace(/-/g, '')}`;
}

export async function feedbackTokenHash(token: string): Promise<string> {
  return sha256Hex(token);
}

export function feedbackSubject(body: string): string {
  const firstLine = body.split('\n')[0].replace(/\s+/g, ' ').trim();
  return firstLine.length > 80 ? `${firstLine.slice(0, 77)}…` : firstLine;
}

export async function bearerMatches(
  candidate: string | null,
  expected: string | undefined,
): Promise<boolean> {
  if (
    !expected ||
    expected.length < 32 ||
    expected.length > 500 ||
    !candidate?.startsWith('Bearer ')
  )
    return false;
  const supplied = candidate.slice(7);
  if (!supplied || supplied.length > 500) return false;
  const [left, right] = await Promise.all([
    sha256Hex(supplied),
    sha256Hex(expected),
  ]);
  let different = left.length ^ right.length;
  for (let index = 0; index < Math.min(left.length, right.length); index++) {
    different |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return different === 0;
}
