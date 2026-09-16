/**
 * Who is issuing the document.
 *
 * The operating entity appeared as a hand-written string in five modules
 * before this file existed; every email footer repeated it. A certificate of
 * analysis and an invoice are both documents that identify their issuer as a
 * matter of law, so the identity is stated once here and imported.
 *
 * `streetAddress` is deliberately null rather than invented. A COA must give
 * the *manufacturer's* name and address (16 CCR 1736.9(d)) and that is held
 * per lot, but an invoice identifies the seller, and no registered street
 * address is on record for the entity. Documents render the lines that exist;
 * setting this is an owner action, not a guess this module gets to make.
 *
 * `city` is Oakland because that is where the entity is registered and where
 * the seller's permit sits. The ship-from address in SHIPPO_ORIGINS_JSON is a
 * different place and a different kind of thing: a rented private mailbox in
 * Lodi that holds no stock and houses no part of the business. The mismatch is
 * deliberate and confirmed by the owner on 16 Sep 2026: do not "correct" this
 * city to match the shipping origin, and never print the shipping origin on an
 * invoice. One identifies the seller; the other is only where mail goes back to.
 */

export const ENTITY = {
  /** Trading name, used as the letterhead. */
  tradingName: 'NexPhase Labs',
  /** Registered entity. */
  legalName: '8486 Ventures LLC',
  jurisdiction: 'California',
  streetAddress: null as string | null,
  city: 'Oakland',
  region: 'CA',
  country: 'United States',
  email: 'orders@nexphaselabs.net',
  website: 'nexphaselabs.net',
} as const;

/** One-line form used in email footers. */
export const ENTITY_FOOTER = `${ENTITY.tradingName} · ${ENTITY.legalName} · ${ENTITY.city}, ${ENTITY.region}`;

/**
 * Address block for a document letterhead, shortest form that is still true.
 * Lines that have no value are omitted rather than printed empty.
 */
export function entityAddressLines(): string[] {
  const lines: string[] = [ENTITY.legalName];
  if (ENTITY.streetAddress) lines.push(ENTITY.streetAddress);
  lines.push(`${ENTITY.city}, ${ENTITY.region}, ${ENTITY.country}`);
  lines.push(ENTITY.website);
  return lines;
}
