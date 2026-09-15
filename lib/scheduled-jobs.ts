/**
 * The worker's cron jobs, run so that one failing job cannot take the others down.
 *
 * They used to share a Promise.all: the first rejection failed the run, skipped the
 * summary log and could cut off the other jobs' in-flight work. Each job now settles
 * on its own and every outcome is logged. The run still fails afterwards if any job
 * did, so Cloudflare records a failed invocation.
 */
export type ScheduledJobs = Record<string, () => Promise<unknown>>;

export async function runScheduledJobs(jobs: ScheduledJobs): Promise<Record<string, unknown>> {
  const names = Object.keys(jobs);
  // Promise.resolve().then turns a job that throws synchronously into a rejection too.
  const settled = await Promise.allSettled(names.map((name) => Promise.resolve().then(() => jobs[name]())));
  const summary: Record<string, unknown> = {};
  const failed: string[] = [];
  settled.forEach((result, index) => {
    const name = names[index];
    if (result.status === 'fulfilled') {
      summary[name] = result.value;
      return;
    }
    const message = result.reason instanceof Error ? result.reason.message : String(result.reason);
    summary[name] = { ok: false, error: message };
    failed.push(name);
    console.error(`[scheduled] ${name} failed`, message);
  });
  console.info('[scheduled] run complete', summary);
  if (failed.length) {
    throw new Error(`[scheduled] ${failed.length} of ${names.length} jobs failed: ${failed.join(', ')}`);
  }
  return summary;
}
