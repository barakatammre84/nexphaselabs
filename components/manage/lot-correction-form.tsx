'use client';

import { useActionState, useState } from 'react';
import { AlertCircle } from 'lucide-react';
import type { LotFormState } from '@/app/manage/lots/actions';
import { CORRECTABLE_FIELDS, CORRECTABLE_LABEL } from '@/lib/lot-rules';

type Props = {
  initial: Record<string, string>;
  quantityLocked: boolean;
  action: (prev: LotFormState, data: FormData) => Promise<LotFormState>;
};

const input = 'h-11 w-full border border-foreground/20 bg-background px-3 font-mono text-sm outline-none focus:border-primary';
const help = 'text-xs leading-5 text-muted-foreground';
const DATE_FIELDS = new Set(['manufactureDate', 'receivedAt', 'retestDate']);

export function LotCorrectionForm({ initial, quantityLocked, action }: Props) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState(action, { values: initial, errors: [], violations: [] });
  const v = { ...initial, ...state.values };
  const problems = state.errors.length + state.violations.length;
  if (!open && problems === 0) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="inline-flex h-11 items-center border border-foreground/20 px-5 text-sm font-semibold hover:border-primary hover:text-primary">
        Correct this record
      </button>
    );
  }
  return (
    <form action={formAction} className="flex flex-col gap-6 border border-border bg-secondary p-5">
      <p className="text-sm leading-6 text-muted-foreground">
        A correction never edits the existing record. A new record with the corrected values becomes current and the
        earlier one stays on file pointing at it. Status, release decision, tests, documents and movements carry over.
        Lot number and product cannot change.
      </p>
      {problems > 0 && (
        <div role="alert" className="border border-destructive/40 bg-background p-4 text-sm">
          <p className="flex items-center gap-2 font-semibold">
            <AlertCircle className="size-4 text-destructive" /> Not recorded. {problems} {problems === 1 ? 'problem' : 'problems'} to fix:
          </p>
          <ul className="mt-2 list-disc space-y-1 pl-6">
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
      <div className="grid gap-5 lg:grid-cols-2">
        {CORRECTABLE_FIELDS.map((f) => {
          const locked = f === 'quantityReceived' && quantityLocked;
          return (
            <label key={f} className="flex flex-col gap-1.5 text-sm font-semibold">
              {CORRECTABLE_LABEL[f]}
              {f === 'manufacturerAddress' ? (
                <textarea name={f} defaultValue={v[f] ?? ''} className="min-h-[4rem] w-full border border-foreground/20 bg-background p-3 font-mono text-sm outline-none focus:border-primary" />
              ) : (
                <input name={f} type={DATE_FIELDS.has(f) ? 'date' : 'text'} defaultValue={v[f] ?? ''} readOnly={locked} className={`${input} ${locked ? 'text-muted-foreground' : ''}`} />
              )}
              {locked && <span className={help}>Material has left this lot; the quantity received can no longer be corrected here.</span>}
            </label>
          );
        })}
        <label className="flex flex-col gap-1.5 text-sm font-semibold lg:col-span-2">
          Reason <span className="font-normal text-primary">*</span>
          <input name="reason" defaultValue={v.reason ?? ''} maxLength={500} className={input} />
          <span className={help}>What was wrong and how you know. Recorded with the correction.</span>
        </label>
      </div>
      <div className="flex items-center gap-4">
        <button type="submit" disabled={pending} className="inline-flex h-11 items-center bg-primary px-5 text-sm font-bold text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
          {pending ? 'Recording…' : 'Record correction'}
        </button>
        <button type="button" onClick={() => setOpen(false)} className="text-sm font-semibold text-muted-foreground hover:text-primary">
          Cancel
        </button>
      </div>
    </form>
  );
}
