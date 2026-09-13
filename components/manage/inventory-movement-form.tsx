'use client';

import { useActionState, useState } from 'react';
import { AlertCircle } from 'lucide-react';
import type { LotFormState } from '@/app/manage/lots/actions';

type Props = {
  today: string;
  canIncrease: boolean;
  action: (previous: LotFormState, data: FormData) => Promise<LotFormState>;
};

const field =
  'h-11 w-full border border-foreground/20 bg-background px-3 text-sm outline-none focus:border-primary';

export function InventoryMovementForm({ today, canIncrease, action }: Props) {
  const [state, formAction, pending] = useActionState(action, {
    values: { occurredOn: today, movementType: 'sample', direction: 'decrease' },
    errors: [],
    violations: [],
  });
  const [kind, setKind] = useState(state.values.movementType || 'sample');
  const values = state.values;

  return (
    <form action={formAction} className="mt-4 border border-border bg-secondary p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm font-semibold">Record non-sale movement</p>
          <p className="mt-1 max-w-2xl text-xs leading-5 text-muted-foreground">
            Use this for a laboratory sample, witnessed destruction, or a
            reconciled count variance. Never edit the original receipt to hide
            a later movement.
          </p>
        </div>
      </div>
      {state.errors.length > 0 && (
        <div role="alert" className="mt-4 flex gap-2 border border-destructive/40 bg-background p-3 text-sm">
          <AlertCircle className="mt-0.5 size-4 shrink-0 text-destructive" />
          <ul className="list-disc pl-5">
            {state.errors.map((error) => <li key={error}>{error}</li>)}
          </ul>
        </div>
      )}
      <div className="mt-5 grid gap-4 lg:grid-cols-3">
        <label className="flex flex-col gap-1 text-xs font-semibold">
          Movement
          <select
            name="movementType"
            key={values.movementType}
            defaultValue={values.movementType || 'sample'}
            onChange={(event) => setKind(event.target.value)}
            className={field}
          >
            <option value="sample">Laboratory sample</option>
            <option value="destruction">Destruction</option>
            <option value="adjustment">Count adjustment</option>
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs font-semibold">
          Direction
          <select
            name="direction"
            key={`${kind}-${values.direction}`}
            defaultValue={kind === 'adjustment' ? values.direction || 'decrease' : 'decrease'}
            disabled={kind !== 'adjustment'}
            className={field}
          >
            <option value="decrease">Decrease on-hand</option>
            {canIncrease && <option value="increase">Increase on-hand</option>}
          </select>
          {kind !== 'adjustment' && <input type="hidden" name="direction" value="decrease" />}
        </label>
        <label className="flex flex-col gap-1 text-xs font-semibold">
          Quantity
          <input
            name="quantity"
            required
            defaultValue={values.quantity ?? ''}
            placeholder="2 mg or 1 vial"
            className={`${field} font-mono`}
          />
        </label>
        <label className="flex flex-col gap-1 text-xs font-semibold">
          Actual date
          <input
            name="occurredOn"
            type="date"
            required
            max={today}
            defaultValue={values.occurredOn || today}
            className={field}
          />
        </label>
        <label className="flex flex-col gap-1 text-xs font-semibold lg:col-span-2">
          Reason / source record
          <input
            name="reason"
            required
            minLength={10}
            maxLength={500}
            defaultValue={values.reason ?? ''}
            placeholder="Why the stock changed and where the supporting record is filed"
            className={field}
          />
        </label>
        {kind === 'destruction' && (
          <>
            <label className="flex flex-col gap-1 text-xs font-semibold">
              Witness one
              <input name="witnessOne" required maxLength={120} defaultValue={values.witnessOne ?? ''} className={field} />
            </label>
            <label className="flex flex-col gap-1 text-xs font-semibold">
              Witness two
              <input name="witnessTwo" required maxLength={120} defaultValue={values.witnessTwo ?? ''} className={field} />
            </label>
          </>
        )}
      </div>
      <div className="mt-5 flex flex-wrap items-center gap-3 border-t border-border pt-5">
        <button
          type="submit"
          disabled={pending}
          className="inline-flex h-11 items-center bg-primary px-5 text-sm font-bold text-primary-foreground disabled:opacity-50"
        >
          {pending ? 'Recording…' : 'Record movement'}
        </button>
        <p className="text-xs text-muted-foreground">
          Removing stock cannot consume quantity reserved for an order. Increasing
          a released lot is refused until QC places it on hold.
        </p>
      </div>
    </form>
  );
}
