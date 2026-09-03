'use client';

import { useActionState, useState } from 'react';
import { AlertCircle } from 'lucide-react';
import type { LotFormState } from '@/app/manage/lots/actions';
import type { VerificationDecision } from '@/lib/organization-rules';

type Props = { action: (prev: LotFormState, data: FormData) => Promise<LotFormState> };

const OPTIONS: { value: VerificationDecision; label: string; description: string }[] = [
  { value: 'approve', label: 'Approve', description: 'The organisation is verified. Pricing and availability become visible to the account.' },
  { value: 'more_info', label: 'Ask for more information', description: 'The applicant is emailed your note and can resubmit.' },
  { value: 'decline', label: 'Decline', description: 'The applicant is emailed your note. They may resubmit with different details.' },
];

export function VerificationDecisionForm({ action }: Props) {
  const [state, formAction, pending] = useActionState(action, { values: {}, errors: [], violations: [] });
  const [decision, setDecision] = useState<VerificationDecision | ''>('');

  return (
    <form action={formAction} className="flex flex-col gap-5 border border-border bg-secondary p-5">
      <p className="text-sm font-semibold">Decision</p>
      {state.errors.length > 0 && (
        <div role="alert" className="border border-destructive/40 bg-background p-4 text-sm">
          <p className="flex items-center gap-2 font-semibold">
            <AlertCircle className="size-4 text-destructive" /> Not recorded:
          </p>
          <ul className="mt-2 list-disc space-y-1 pl-6">
            {state.errors.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        </div>
      )}
      <fieldset className="flex flex-col gap-2">
        {OPTIONS.map((o) => (
          <label key={o.value} className="flex items-start gap-3 text-sm">
            <input type="radio" name="decision" value={o.value} checked={decision === o.value} onChange={() => setDecision(o.value)} className="mt-1" />
            <span>
              <span className="font-semibold">{o.label}</span>
              <span className="block text-xs leading-5 text-muted-foreground">{o.description}</span>
            </span>
          </label>
        ))}
      </fieldset>
      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-semibold">Note to the applicant{decision && decision !== 'approve' ? ' *' : ''}</span>
        <textarea name="note" defaultValue={state.values.note ?? ''} className="min-h-[5rem] w-full border border-foreground/20 bg-background p-3 text-sm outline-none focus:border-primary" />
      </label>
      <button
        type="submit"
        disabled={pending || !decision}
        className="inline-flex h-11 w-fit items-center justify-center bg-primary px-5 text-sm font-bold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
      >
        {pending ? 'Recording…' : decision ? `Confirm: ${OPTIONS.find((o) => o.value === decision)?.label}` : 'Choose a decision'}
      </button>
    </form>
  );
}
