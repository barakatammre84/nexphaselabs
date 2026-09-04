import { describe, expect, it } from 'vitest';
import {
  buildHazcomContent,
  hazcomNumber,
  hazcomSequenceKey,
  type HazcomChemical,
  type HazcomSubject,
} from '@/lib/hazcom-content';
import { SETTING_KEYS, type SettingsMap } from '@/lib/settings-keys';

const chemical = (over: Partial<HazcomChemical> = {}): HazcomChemical => ({
  productCode: 'NPL-001',
  productName: 'BPC-157',
  casNumber: '137525-51-0',
  signalWord: 'warning',
  pictograms: ['GHS07'],
  classified: true,
  hasSds: true,
  ...over,
});

const complete: SettingsMap = {
  [SETTING_KEYS.registeredAddress]: '1 Example Street, Oakland, CA 94607',
  [SETTING_KEYS.telephone]: '+1 555 0100',
  [SETTING_KEYS.hazcomResponsible]: 'Grace QC, Quality Manager',
  [SETTING_KEYS.hazcomWorkplace]: 'Oakland facility, receiving and QC areas',
  [SETTING_KEYS.hazcomSdsAccess]: 'Binder in the QC area and the shared drive',
  [SETTING_KEYS.hazcomTraining]: 'At assignment and whenever a new hazard is introduced',
  [SETTING_KEYS.hazcomNonRoutine]: 'Briefed by the quality manager beforehand',
};

const subject = (
  settings: SettingsMap = complete,
  chemicals: HazcomChemical[] = [chemical()],
): HazcomSubject => ({ settings, chemicals });

describe('buildHazcomContent', () => {
  it('reports nothing outstanding when every fact is recorded', () => {
    expect(buildHazcomContent(subject()).outstanding).toEqual([]);
  });

  it('names each missing fact rather than omitting the section', () => {
    const content = buildHazcomContent(subject({}));
    expect(content.outstanding.length).toBeGreaterThan(0);
    // The section still exists, and says so on the page.
    const training = content.sections.find((s) => s.heading.includes('training'))!;
    expect(training.body.join(' ')).toContain('Not recorded.');
    expect(training.outstanding).toContain('Training arrangements');
  });

  it('covers every requirement the standard names', () => {
    const headings = buildHazcomContent(subject()).sections.map((s) => s.heading);
    expect(headings).toContain('Labels and other forms of warning');
    expect(headings).toContain('Safety data sheets');
    expect(headings).toContain('Employee information and training');
    expect(headings).toContain('Non-routine tasks');
  });

  it('counts unclassified chemicals as outstanding', () => {
    const content = buildHazcomContent(
      subject(complete, [
        chemical(),
        chemical({ productCode: 'NPL-002', classified: false, signalWord: null }),
      ]),
    );
    expect(content.outstanding.some((o) => o.includes('unclassified'))).toBe(true);
  });

  it('counts chemicals with no safety data sheet as outstanding', () => {
    const content = buildHazcomContent(
      subject(complete, [chemical({ hasSds: false })]),
    );
    expect(content.outstanding.some((o) => o.includes('safety data sheet'))).toBe(true);
  });

  it('lists the inventory sorted by catalog number', () => {
    const content = buildHazcomContent(
      subject(complete, [
        chemical({ productCode: 'NPL-003' }),
        chemical({ productCode: 'NPL-001' }),
      ]),
    );
    expect(content.inventory.map((i) => i.product.match(/NPL-\d+/)![0])).toEqual([
      'NPL-001',
      'NPL-003',
    ]);
  });

  it('says plainly which inventory entries are unclassified', () => {
    const content = buildHazcomContent(
      subject(complete, [chemical({ classified: false, signalWord: null, pictograms: [] })]),
    );
    expect(content.inventory[0].classification).toBe('Not classified');
  });

  it('shows a not-hazardous finding as a classification, not as a gap', () => {
    const content = buildHazcomContent(
      subject(complete, [chemical({ signalWord: 'none', pictograms: [] })]),
    );
    expect(content.inventory[0].classification).toBe('No signal word');
    expect(content.outstanding).toEqual([]);
  });

  it('reports whether each chemical has a safety data sheet', () => {
    const content = buildHazcomContent(
      subject(complete, [chemical(), chemical({ productCode: 'NPL-002', hasSds: false })]),
    );
    expect(content.inventory.map((i) => i.sds)).toEqual(['On file', 'Not on file']);
  });

  it('handles an empty catalog without pretending it is complete', () => {
    const content = buildHazcomContent(subject(complete, []));
    expect(content.inventory).toEqual([]);
    expect(content.subtitle).toBe('0 chemicals in the inventory');
  });

  it('singularises the subtitle for one chemical', () => {
    expect(buildHazcomContent(subject()).subtitle).toBe('1 chemical in the inventory');
  });
});

describe('numbering', () => {
  it('pads within the year', () => {
    expect(hazcomNumber(2026, 1)).toBe('HAZCOM-2026-001');
    expect(hazcomNumber(2026, 42)).toBe('HAZCOM-2026-042');
  });

  it('keys the series by year', () => {
    expect(hazcomSequenceKey(2026)).toBe('hazcom:2026');
  });
});
