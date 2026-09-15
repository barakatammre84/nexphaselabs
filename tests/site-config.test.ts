import { afterEach, describe, expect, it, vi } from 'vitest';

const { env } = vi.hoisted(() => ({ env: {} as Record<string, unknown> }));
vi.mock('cloudflare:workers', () => ({ env }));

import { researcherTierEnabled } from '@/lib/site-config';

afterEach(() => {
  for (const key of Object.keys(env)) delete env[key];
});

describe('researcher tier switch', () => {
  it('lets an explicit RESEARCHER_TIER_ENABLED win over the legacy alias', () => {
    // production declares "false" in wrangler.jsonc; a leftover legacy value must not reopen the tier
    Object.assign(env, { RESEARCHER_TIER_ENABLED: 'false', CONSUMER_TIER_ENABLED: 'true' });
    expect(researcherTierEnabled()).toBe(false);
    Object.assign(env, { RESEARCHER_TIER_ENABLED: 'true', CONSUMER_TIER_ENABLED: 'false' });
    expect(researcherTierEnabled()).toBe(true);
  });

  it('honours the legacy alias only while the explicit switch is unset or empty', () => {
    env.CONSUMER_TIER_ENABLED = 'true';
    expect(researcherTierEnabled()).toBe(true);
    env.RESEARCHER_TIER_ENABLED = '';
    expect(researcherTierEnabled()).toBe(true);
  });

  it('stays closed when nothing is set, or when the value is anything but "true"', () => {
    expect(researcherTierEnabled()).toBe(false);
    env.RESEARCHER_TIER_ENABLED = 'TRUE';
    expect(researcherTierEnabled()).toBe(false);
  });
});
