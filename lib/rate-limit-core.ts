/** Pure helpers for the fixed-window limiter (no database import, so they are unit-testable). */
export function windowStart(nowMs: number, windowSeconds: number): number {
  return Math.floor(nowMs / 1000 / windowSeconds) * windowSeconds;
}

export function rateLimitKey(scope: string, subject: string): string {
  return `${scope}:${subject.trim().toLowerCase().slice(0, 200)}`;
}

/** Best-effort client address for per-IP limits behind Cloudflare. */
export function clientAddress(request: Request): string {
  return request.headers.get('cf-connecting-ip') ?? request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';
}
