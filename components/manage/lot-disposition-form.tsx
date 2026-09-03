'use client';

import { useActionState, useState } from 'react';
import { AlertCircle, CircleCheck, CircleX } from 'lucide-react';
import type { LotFormState } from '@/app/manage/lots/actions';
import type { Disposition } from '@/lib/lot-rules';

type Props = {
  currentStatus: string;
  allowed: Disposition[];
  blockers: string[];
  action: (prev: LotFormState, data: FormData) => Promise<LotFormState>;
};

const LABEL: Record<Disposition, string> = {
  release: 'Release',
  hold: 'Put on hold',
  reject: 'Reject',
  withdraw: 'Withdraw',
};

const DESCRIPTION: Record<Disposition, string> = {
  release: 'Makes the lot sellable and resolvable in the public lot lookup. Recorded under your name.',
  hold: 'Stops the lot from being sold or looked up until it is released again. Give the reason.',
  reject: 'The lot fails and will not be released. Give the reason.',
  withdraw: 'A recall: the lot is removed from sale permanently. Give the reason.',
};

export function LotDispositionForm({ currentStatus, allowed, blockers, action }: Props) {
  const [state, formAction, pending] = useActionState(action, { values: {}, errors: [], violations: [] });
  const [decision, setDecision] = useState<Disposition | ''>(state.values.decision as Disposition | '' || '');
  const problems = state.errors.length + state.violations.length;
  const releaseBlocked = blockers.length > 0;

  if (allowed.length === 0) {
    return (
      <div className="border border-border bg-secondary p-5 text-sm">
        A lot in status <span className="font-mono">{currentStatus}</span> is final. No further decisions can be recorded.
      </div>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-5 border border-border bg-secondary p-5">
      <p className="text-sm font-semibold">Disposition</p>

      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.1em] text-muted-foreground">Release checklist</p>
        <ul className="mt-2 space-y-1 text-sm">
          {blockers.length === 0 ? (
            <li className="flex items-center gap-2">
              <CircleCheck className="size-4 text-primary" /> All release conditions are met.
            </li>
          ) : (
            blockers.map((b) => (
              <li key={b} className="flex items-start gap-2">
                <CircleX className="mt-0.5 size-4 shrink-0 text-destructive" /> {b}
              </li>
            ))
          )}
        </ul>
      </div>

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

      <fieldset className="flex flex-col gap-2">
        <legend className="text-sm font-semibold">Decision</legend>
        {allowed.map((d) => {
          const disabled = d === 'release' && releaseBlocked;
          return (
            <label key={d} className={`flex items-start gap-3 text-sm ${disabled ? 'opacity-50' : ''}`}>
              <input
                type="radio"
                name="decision"
                value={d}
                disabled={disabled}
                checked={decision === d}
                onChange={() => setDecision(d)}
                className="mt-1"
              />
              <span>
                <span className="font-semibold">{LABEL[d]}</span>
                <span className="block text-xs leading-5 text-muted-foreground">{DESCRIPTION[d]}</span>
              </span>
            </label>
          );
        })}
      </fieldset>

      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-semibold">Reason{decision && decision !== 'release' ? ' *' : ''}</span>
        <textarea
          name="reason"
          defaultValue={state.values.reason ?? ''}
          className="min-h-[5rem] w-full border border-foreground/20 bg-background p-3 font-mono text-sm outline-none focus:border-primary"
        />
      </label>

      <div className="flex items-center gap-4">
        <button
          type="submit"
          disabled={pending || !decision}
          className="inline-flex h-11 items-center justify-center bg-primary px-5 text-sm font-bold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          {pending ? 'Recording…' : decision ? `Confirm: ${LABEL[decision]}` : 'Choose a decision'}
        </button>
        <p className="text-xs leading-5 text-muted-foreground">Every decision is recorded with your name and the date.</p>
      </div>
    </form>
  );
}
