import { afterEach, describe, expect, it, vi } from 'vitest';
import { runScheduledJobs } from '@/lib/scheduled-jobs';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('scheduled jobs', () => {
  it('runs every job when one fails, logs each outcome, then fails the run', async () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => undefined);
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    let maintenanceFinished = false;

    const run = runScheduledJobs({
      notifications: async () => {
        throw new Error('D1 unavailable');
      },
      maintenance: async () => {
        await new Promise((resolve) => setTimeout(resolve, 5));
        maintenanceFinished = true;
        return { removed: 3 };
      },
      zelle: () => Promise.resolve({ ok: true, skipped: true }),
    });

    await expect(run).rejects.toThrow('1 of 3 jobs failed: notifications');
    expect(maintenanceFinished).toBe(true);
    expect(error).toHaveBeenCalledWith('[scheduled] notifications failed', 'D1 unavailable');
    expect(info).toHaveBeenCalledWith('[scheduled] run complete', {
      notifications: { ok: false, error: 'D1 unavailable' },
      maintenance: { removed: 3 },
      zelle: { ok: true, skipped: true },
    });
  });

  it('records a job that throws before returning a promise as a failure', async () => {
    vi.spyOn(console, 'info').mockImplementation(() => undefined);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const other = vi.fn(async () => 'done');
    await expect(
      runScheduledJobs({
        broken: () => {
          throw new Error('bad configuration');
        },
        other,
      }),
    ).rejects.toThrow('1 of 2 jobs failed: broken');
    expect(other).toHaveBeenCalledTimes(1);
  });

  it('returns the summary when every job succeeds', async () => {
    vi.spyOn(console, 'info').mockImplementation(() => undefined);
    await expect(runScheduledJobs({ a: async () => 1, b: async () => 2 })).resolves.toEqual({ a: 1, b: 2 });
  });
});
