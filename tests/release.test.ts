import { afterEach, describe, expect, it, vi } from 'vitest';
import { releaseCommit } from '@/lib/release';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('release commit', () => {
  it('is null when the build wrote no commit in', () => {
    expect(releaseCommit()).toBeNull();
  });

  it('reports the commit the build wrote in', () => {
    vi.stubGlobal('__RELEASE_SHA__', '3221efc5a3b503ae9edf21801e72fe7dfcb75c4f');
    expect(releaseCommit()).toBe('3221efc5a3b503ae9edf21801e72fe7dfcb75c4f');
  });
});
