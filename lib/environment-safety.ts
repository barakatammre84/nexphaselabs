/** Fail closed: only an explicitly production runtime may use live payment rails. */
export function livePaymentsAllowed(environment: string | undefined): boolean {
  return environment === 'production';
}

/** Staging email is opt-in per exact mailbox, never by domain or wildcard. */
export function emailRecipientAllowed(
  environment: string | undefined,
  recipient: string,
  allowlist: string | undefined,
): boolean {
  if (environment === 'production') return true;
  const email = recipient.trim().toLowerCase();
  if (!/^[^\s<>@,;]+@[^\s<>@,;]+\.[^\s<>@,;]+$/.test(email)) return false;
  return (allowlist ?? '').split(',').some((entry) => entry.trim().toLowerCase() === email);
}
