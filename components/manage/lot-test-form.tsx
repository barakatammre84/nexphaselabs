'use client';

import { useActionState } from 'react';
import { AlertCircle } from 'lucide-react';
import type { LotFormState } from '@/app/manage/lots/actions';
import { TEST_TYPES, TEST_TYPE_LABEL } from '@/lib/lot-rules';

type Props = {
  today: string;
  action: (prev: LotFormState, data: FormData) => Promise<LotFormState>;
};

const input = 'h-11 w-full border border-foreground/20 bg-background px-3 font-mono text-sm outline-none focus:border-primary';
const label = 'text-sm font-semibold';
const help = 'text-xs leading-5 text-muted-foreground';

export function LotTestForm({ today, action }: Props) {
  const [state, formAction, pending] = useActionState(action, { values: { testedAt: today }, errors: [], violations: [] });
  const v = state.values;
  const problems = state.errors.length + state.violations.length;

  return (
    <form action={formAction} className="flex flex-col gap-5 border border-border bg-secondary p-5">
      <p className="text-sm font-semibold">Record a test result</p>
      {problems > 0 && (
        <div role="alert" className="border border-destructive/40 bg-background p-4">
          <p className="flex items-center gap-2 text-sm font-semibold">
            <AlertCircle className="size-4 text-destructive" /> Not recorded:
          </p>
          <ul className="mt-2 list-disc space-y-1 pl-6 text-sm">
            {state.errors.map((e) => (
              <li key={e}>{e}</li>
            ))}
            {state.violations.map((x) => (
              <li key={`${x.field}-${x.match}`}>
                <span className="font-mono text-xs">{x.field}</span>: contains {x.reason} (&ldquo;{x.match}&rdquo;).
              </li>
            ))}
          </ul>
        </div>
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="flex flex-col gap-1.5">
          <span className={label}>Test type</span>
          <select name="testType" defaultValue={v.testType || 'purity'} className={input}>
            {TEST_TYPES.map((t) => (
              <option key={t} value={t}>
                {TEST_TYPE_LABEL[t]}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1.5">
          <span className={label}>Analyte</span>
          <input name="analyte" defaultValue={v.analyte ?? ''} className={input} />
          <span className={help}>Required for heavy metals and residual solvents (e.g. "Lead", "Acetonitrile").</span>
        </label>
        <label className="flex flex-col gap-1.5">
          <span className={label}>Method</span>
          <input name="method" defaultValue={v.method ?? ''} className={input} />
          <span className={help}>e.g. "RP-HPLC, 220 nm", "LC-MS", "Karl Fischer", "ICP-MS".</span>
        </label>
        <label className="flex flex-col gap-1.5">
          <span className={label}>Result</span>
          <input name="result" defaultValue={v.result ?? ''} className={input} />
          <span className={help}>The measurement: &ldquo;98.7%&rdquo;, &ldquo;Conforms&rdquo;, &ldquo;&lt; 0.5 ppm&rdquo;.</span>
        </label>
        <label className="flex flex-col gap-1.5">
          <span className={label}>Specification</span>
          <input name="specification" defaultValue={v.specification ?? ''} className={input} />
          <span className={help}>What it was judged against: "≥ 95%", "≤ 10 ppm".</span>
        </label>
        <label className="flex flex-col gap-1.5">
          <span className={label}>Outcome</span>
          <select name="passed" defaultValue={v.passed ?? ''} className={input}>
            <option value="">Not assessed</option>
            <option value="pass">Pass</option>
            <option value="fail">Fail</option>
          </select>
        </label>
        <label className="flex flex-col gap-1.5">
          <span className={label}>Tested by</span>
          <input name="testedBy" defaultValue={v.testedBy ?? ''} className={input} />
          <span className={help}>Analyst or laboratory. Blank records you.</span>
        </label>
        <label className="flex flex-col gap-1.5">
          <span className={label}>Date tested</span>
          <input name="testedAt" type="date" defaultValue={v.testedAt ?? ''} className={input} />
        </label>
      </div>
      <div className="flex items-center gap-4">
        <button
          type="submit"
          disabled={pending}
          className="inline-flex h-11 items-center justify-center bg-primary px-5 text-sm font-bold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          {pending ? 'Recording…' : 'Record result'}
        </button>
        <p className={help}>One row per test. Results are never edited; record a new row to correct one.</p>
      </div>
    </form>
  );
}
