import { getDomain } from 'tldts';
import { scanText, type Violation } from '@/lib/catalog-rules';
import { emailDomain } from '@/lib/account-rules';

/**
 * Organisation submission rules. Automatic checks either reject outright or
 * add a flag for the reviewer; the decision itself is always a person's.
 */

export const ORGANIZATION_TYPES = [
  'university',
  'hospital',
  'cro',
  'analytical_lab',
  'company',
  'government',
  'other',
] as const;
export type OrganizationType = (typeof ORGANIZATION_TYPES)[number];

export const ORGANIZATION_TYPE_LABEL: Record<OrganizationType, string> = {
  university: 'University or academic laboratory',
  hospital: 'Teaching hospital or medical research institute',
  cro: 'Contract research organisation',
  analytical_lab: 'Analytical or testing laboratory',
  company: 'Company with in-house research',
  government: 'Government or public laboratory',
  other: 'Other research organisation',
};

export const DOCUMENT_KINDS = ['registration', 'letterhead', 'other'] as const;
export type OrganizationDocumentKind = (typeof DOCUMENT_KINDS)[number];
export const DOCUMENT_KIND_LABEL: Record<OrganizationDocumentKind, string> = {
  registration: 'Business or institutional registration',
  letterhead: 'Purchase order or letter on organisation letterhead',
  other: 'Other supporting document',
};

export type OrganizationInput = {
  legalName: string;
  website: string;
  organizationType: string;
  addressLine1: string;
  addressLine2?: string | null;
  city: string;
  region: string;
  postalCode: string;
  country: string;
  phone?: string | null;
  registrationNumber?: string | null;
  researchContext: string;
  receivingParty: string;
};

export type OrganizationValidation =
  | {
      ok: true;
      value: Required<Omit<OrganizationInput, 'addressLine2' | 'phone' | 'registrationNumber'>> & {
        addressLine2: string | null;
        phone: string | null;
        registrationNumber: string | null;
        organizationType: OrganizationType;
        websiteHost: string;
        emailDomain: string;
      };
      flags: string[];
    }
  | { ok: false; errors: string[]; violations: Violation[] };

/** Strip protocol, path and www. from a website. */
export function websiteHost(value: string): string | null {
  const trimmed = value.trim().toLowerCase();
  if (!trimmed) return null;
  try {
    const url = new URL(trimmed.includes('://') ? trimmed : `https://${trimmed}`);
    if (!/^[a-z0-9.-]+\.[a-z]{2,}$/.test(url.hostname)) return null;
    return url.hostname.replace(/^www\./, '');
  } catch {
    return null;
  }
}

/** The registrable domain under the Public Suffix List (nhs.uk → trust.nhs.uk, ac.uk → ox.ac.uk). */
export function registrableDomain(host: string): string {
  return getDomain(host, { allowPrivateDomains: false }) ?? host;
}

const PO_BOX = /\b(p\.?\s*o\.?\s*box|post\s*office\s*box|pmb\s*#?\d)/i;
/** Hard rejections: unambiguous residential markers. */
const RESIDENTIAL = /\b(apt\.?|apartment|residence|residential)\b/i;
/** Soft signals for the reviewer. */
const RESIDENTIAL_HINT = /\b(unit\s*#?\s*\d+|flat\b|home\b)/i;
/** Statements of human use. These block; everything else the scanner finds is a flag for the reviewer. */
const HUMAN_USE =
  /\b(for\s+(my|our|personal)\s+(own\s+)?use|self[\s-]?administ\w*|on\s+myself|administer\w*\s+(?:it|this|them|these|the\s+\w+)?\s*to\s+(?:humans?|people|patients?|clients?|customers?|volunteers?|subjects?)|(inject|take|dose|consume)\s+(it\s+)?(myself|ourselves)|human\s+(use|consumption|subjects?|trial)|weight[\s-]?loss\s+(clinic|program|clients?))\b/i;

export function validateOrganization(raw: OrganizationInput, accountEmail: string): OrganizationValidation {
  const errors: string[] = [];
  const violations: Violation[] = [];
  const flags: string[] = [];
  const t = (s: string | null | undefined) => (s ?? '').trim().replace(/\s+/g, ' ');

  const legalName = t(raw.legalName);
  const website = t(raw.website);
  const organizationType = t(raw.organizationType);
  const addressLine1 = t(raw.addressLine1);
  const addressLine2 = t(raw.addressLine2) || null;
  const city = t(raw.city);
  const region = t(raw.region);
  const postalCode = t(raw.postalCode);
  const country = t(raw.country);
  const phone = t(raw.phone) || null;
  const registrationNumber = t(raw.registrationNumber) || null;
  const researchContext = (raw.researchContext ?? '').trim();
  const receivingParty = t(raw.receivingParty);

  if (legalName.length < 3 || legalName.length > 200) errors.push('Enter the organisation’s legal name.');
  const host = websiteHost(website);
  if (!host) errors.push('Enter the organisation’s website (e.g. lab.example.edu).');
  if (!(ORGANIZATION_TYPES as readonly string[]).includes(organizationType)) errors.push('Choose the organisation type.');
  if (!addressLine1) errors.push('Enter the shipping street address.');
  if (!city) errors.push('Enter the city.');
  if (!region) errors.push('Enter the state, province or region.');
  if (!postalCode) errors.push('Enter the postal code.');
  if (!country) errors.push('Enter the country.');
  if (researchContext.length < 40) errors.push('Describe the research context in at least a sentence or two.');
  if (researchContext.length > 2000) errors.push('Keep the research context under 2000 characters.');
  if (receivingParty.length < 3) errors.push('Name the person responsible for receiving, storing and handling material.');
  if (phone && !/^[+\d][\d\s().-]{6,24}$/.test(phone)) errors.push('Enter a valid phone number.');

  // Hard rules: no PO boxes, no residential markers.
  const address = `${addressLine1} ${addressLine2 ?? ''}`;
  if (PO_BOX.test(address)) errors.push('Material cannot ship to a PO box or mailbox service. Give the laboratory’s street address.');
  if (RESIDENTIAL.test(address)) {
    errors.push('This looks like a residential address. Material ships to laboratory or business addresses only.');
  }

  // Domain check: the account email must belong to the organisation.
  const domain = emailDomain(accountEmail);
  if (host) {
    const site = registrableDomain(host);
    const mail = registrableDomain(domain);
    if (site !== mail && !host.endsWith(`.${mail}`) && !domain.endsWith(`.${site}`)) {
      errors.push(
        `Your account email is on ${domain}, which does not match the website ${host}. Use an address on the organisation’s domain.`,
      );
    }
  }

  // Reviewer flags: not blocking, but worth a look.
  if (!registrationNumber) flags.push('No registration or tax number given.');
  if (organizationType === 'other') flags.push('Organisation type is "other".');
  if (/\b(suite|ste\.?|#)\s*\d+/i.test(address)) flags.push('Address includes a suite number — confirm it is a business premises.');
  if (RESIDENTIAL_HINT.test(address)) flags.push('Address wording could be residential (unit, flat, home) — confirm it is a laboratory or business premises.');
  if (host && /\.(edu|ac|gov)\./.test(host) && !/\.(edu|ac|gov)(\.[a-z]{2})?$/.test(host)) {
    flags.push(`Website host "${host}" carries an institutional label in the middle of the name — check it is not a lookalike.`);
  }

  // The research context is staff-only intake, not published copy. A stated
  // intention of human use blocks outright; any other hit from the public-copy
  // scanner (a disease name in an animal-model description, a route in an
  // assay protocol) is surfaced to the reviewer rather than rejected.
  if (HUMAN_USE.test(researchContext)) {
    violations.push({ field: 'researchContext', reason: 'a stated intention of human use', match: researchContext.match(HUMAN_USE)?.[0] ?? '' });
  }
  for (const [field, text] of [
    ['researchContext', researchContext],
    ['legalName', legalName],
    ['receivingParty', receivingParty],
  ] as const) {
    for (const hit of scanText(field, text)) {
      flags.push(`${field} mentions ${hit.reason} ("${hit.match}") — read it against the research-use policy.`);
    }
  }

  if (errors.length || violations.length) return { ok: false, errors, violations };
  return {
    ok: true,
    flags,
    value: {
      legalName,
      website,
      organizationType: organizationType as OrganizationType,
      addressLine1,
      addressLine2,
      city,
      region,
      postalCode,
      country,
      phone,
      registrationNumber,
      researchContext,
      receivingParty,
      websiteHost: host!,
      emailDomain: domain,
    },
  };
}

export const VERIFICATION_DECISIONS = ['approve', 'decline', 'more_info', 'revoke'] as const;
export type VerificationDecision = (typeof VERIFICATION_DECISIONS)[number];
export const DECISION_TARGET: Record<VerificationDecision, string> = {
  approve: 'approved',
  decline: 'declined',
  more_info: 'more_info',
  revoke: 'revoked',
};
/** Which decisions apply to an organisation in a given status. Revocation is the only decision on an approved one. */
export function decisionsFor(status: string): VerificationDecision[] {
  if (status === 'submitted' || status === 'more_info') return ['approve', 'more_info', 'decline'];
  if (status === 'approved') return ['revoke'];
  return [];
}

export function validateVerificationDecision(raw: { decision: string; note?: string | null }): {
  ok: true;
  value: { decision: VerificationDecision; note: string | null };
} | { ok: false; errors: string[] } {
  const decision = (raw.decision ?? '').trim();
  const note = (raw.note ?? '').trim() || null;
  const errors: string[] = [];
  if (!(VERIFICATION_DECISIONS as readonly string[]).includes(decision)) errors.push('Choose a decision.');
  if (decision !== 'approve' && !note) errors.push('Give the applicant a reason or a request.');
  if (note && note.length > 1000) errors.push('Keep the note under 1000 characters.');
  if (errors.length) return { ok: false, errors };
  return { ok: true, value: { decision: decision as VerificationDecision, note } };
}
