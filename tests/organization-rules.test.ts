import { describe, expect, it } from 'vitest';
import {
  registrableDomain,
  validateOrganization,
  validateVerificationDecision,
  websiteHost,
  type OrganizationInput,
} from '@/lib/organization-rules';

const good: OrganizationInput = {
  legalName: 'Example University',
  website: 'https://www.example-university.edu/chemistry',
  organizationType: 'university',
  addressLine1: '100 Science Drive, Room 210',
  city: 'Berkeley',
  region: 'CA',
  postalCode: '94720',
  country: 'United States',
  phone: '+1 510 555 0100',
  registrationNumber: '94-1234567',
  researchContext: 'Reversed-phase HPLC method development and mass-spectrometry identity confirmation for peptide reference materials.',
  receivingParty: 'Dr Ada Lovelace, laboratory manager',
};
const email = 'ada@chem.example-university.edu';

describe('website and domains', () => {
  it('normalises hosts and derives registrable domains', () => {
    expect(websiteHost('https://www.example-university.edu/chemistry')).toBe('example-university.edu');
    expect(websiteHost('lab.example.org')).toBe('lab.example.org');
    expect(websiteHost('not a host')).toBeNull();
    expect(registrableDomain('chem.example-university.edu')).toBe('example-university.edu');
    expect(registrableDomain('bio.ox.ac.uk')).toBe('ox.ac.uk');
    expect(registrableDomain('example.com')).toBe('example.com');
    expect(registrableDomain('pathology.thehospital.nhs.uk')).toBe('thehospital.nhs.uk');
    expect(registrableDomain('lab.riken.go.jp')).toBe('riken.go.jp');
    expect(validateOrganization({ ...good, website: 'https://otherhospital.nhs.uk' }, 'x@thehospital.nhs.uk').ok).toBe(false);
  });
});

describe('validateOrganization', () => {
  it('accepts a complete submission on a matching domain', () => {
    const r = validateOrganization(good, email);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.websiteHost).toBe('example-university.edu');
      expect(r.value.emailDomain).toBe('chem.example-university.edu');
      expect(r.flags).toEqual([]);
    }
  });

  it('rejects a mismatched email domain', () => {
    const r = validateOrganization(good, 'ada@other-college.edu');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.join(' ')).toMatch(/does not match/);
  });

  it('rejects PO boxes and unambiguous residential markers', () => {
    expect(validateOrganization({ ...good, addressLine1: 'PO Box 123' }, email).ok).toBe(false);
    expect(validateOrganization({ ...good, addressLine1: '12 Elm St Apt 4B' }, email).ok).toBe(false);
    expect(validateOrganization({ ...good, addressLine2: 'Apartment 9' }, email).ok).toBe(false);
  });

  it('flags rather than blocks soft signals', () => {
    const r = validateOrganization({ ...good, registrationNumber: '', addressLine1: '500 Market St, Suite 400', organizationType: 'other' }, email);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.flags.length).toBe(3);
    const unit = validateOrganization({ ...good, addressLine1: 'Unit #4, Home Depot Research Campus' }, email);
    expect(unit.ok).toBe(true);
    if (unit.ok) expect(unit.flags.some((f) => /residential/.test(f))).toBe(true);
    const lookalike = validateOrganization({ ...good, website: 'https://example-university.edu.evil.com' }, 'ada@evil.com');
    expect(lookalike.ok).toBe(true);
    if (lookalike.ok) expect(lookalike.flags.some((f) => /lookalike/.test(f))).toBe(true);
  });

  it('flags disease or route mentions in a research context but blocks stated human use', () => {
    const animal = validateOrganization(
      { ...good, researchContext: 'Assessing subcutaneous dosing regimens of peptide agonists in a diabetic rodent model, with HPLC purity confirmation of each lot before use.' },
      email,
    );
    expect(animal.ok).toBe(true);
    if (animal.ok) expect(animal.flags.some((f) => /researchContext mentions/.test(f))).toBe(true);
    expect(validateOrganization({ ...good, researchContext: 'Material is for my own use; I will inject it myself as part of a personal wellness routine.' }, email).ok).toBe(false);
    expect(validateOrganization({ ...good, researchContext: 'We will administer it to clients of our weight-loss clinic under a physician protocol.' }, email).ok).toBe(false);
  });

  it('requires the core fields and a real research context', () => {
    expect(validateOrganization({ ...good, legalName: 'X' }, email).ok).toBe(false);
    expect(validateOrganization({ ...good, website: '' }, email).ok).toBe(false);
    expect(validateOrganization({ ...good, organizationType: 'clinic' }, email).ok).toBe(false);
    expect(validateOrganization({ ...good, researchContext: 'Testing.' }, email).ok).toBe(false);
    expect(validateOrganization({ ...good, receivingParty: '' }, email).ok).toBe(false);
  });

  it('refuses a research context written for a prohibited use', () => {
    const r = validateOrganization({ ...good, researchContext: 'We plan to administer this to patients as a weekly subcutaneous injection for recovery.' }, email);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.violations[0]?.reason).toMatch(/human use/);
  });
});

describe('validateVerificationDecision', () => {
  it('requires a note except on approval', () => {
    expect(validateVerificationDecision({ decision: 'approve' }).ok).toBe(true);
    expect(validateVerificationDecision({ decision: 'decline' }).ok).toBe(false);
    expect(validateVerificationDecision({ decision: 'decline', note: 'Website does not resolve.' }).ok).toBe(true);
    expect(validateVerificationDecision({ decision: 'more_info', note: 'Please attach a purchase order.' }).ok).toBe(true);
    expect(validateVerificationDecision({ decision: 'delete' }).ok).toBe(false);
  });
});
