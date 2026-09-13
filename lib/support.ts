/**
 * Support commitments shown on the contact page and repeated in the queue.
 *
 * These are operating commitments, not marketing copy: the queue's ageing
 * alerts (lib/feedback.ts) and the operating charter's response-time control
 * read the same numbers. Change them here and both move together.
 *
 * Simulated answer recorded in the launch decision log (12 Sep 2026): hours
 * and the one-business-day commitment are placeholders for the operations
 * owner to confirm before the storefront opens.
 */
export const SUPPORT = {
  /** Public contact mailbox. Must exist as a Workspace alias or group before launch. */
  email: 'research@nexphaselabs.net',
  hours: 'Monday to Friday, 9:00 to 17:00 Pacific, excluding US federal holidays',
  /** First human reply. */
  firstReply: 'within one business day',
  /** Order and shipping questions received during hours. */
  orderReply: 'the same business day when received before 14:00 Pacific',
  /** What the team will not answer, stated so the boundary is not discovered mid-conversation. */
  outOfScope:
    'We do not provide medical, dosing, reconstitution or experimental-use guidance. Questions of that kind are declined, not answered.',
} as const;

export const CONTACT_TOPICS = [
  { value: 'order', label: 'An order (include the order number)' },
  { value: 'documents', label: 'Lot documentation — COA, chromatogram, SDS (include the lot number)' },
  { value: 'account', label: 'Account access or sign-in' },
  { value: 'availability', label: 'Product availability or a quote for an institution' },
  { value: 'quality', label: 'A quality concern about material received' },
  { value: 'other', label: 'Something else' },
] as const;

export type ContactTopic = (typeof CONTACT_TOPICS)[number]['value'];

/** Subject line the queue shows staff: topic first, reference second, so triage needs no click. */
export function contactSubject(topic: string, reference: string): string {
  const label = CONTACT_TOPICS.find((t) => t.value === topic)?.label.split(' — ')[0].split(' (')[0] ?? 'Contact';
  const ref = reference.trim().slice(0, 40);
  return (ref ? `${label}: ${ref}` : label).slice(0, 100);
}
