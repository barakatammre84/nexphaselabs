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
 * the seller's permit sits. Parcels leave from a different place -- Lodi, San
 * Joaquin County, configured as the ship-from origin in SHIPPO_ORIGINS_JSON.
 * The mismatch is deliberate and confirmed by the owner on 16 Sep 2026: do not
 * "correct" this city to match the shipping origin, and do not print the
 * shipping origin on an invoice. One is where the seller is; the other is
 * where a box starts its journey.
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
