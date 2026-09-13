'use client';

import { useActionState } from 'react';
import { AlertCircle, CircleCheck } from 'lucide-react';
import type { OrderHandoffState } from '@/app/manage/orders/actions';

type Props = {
  action: (previous: OrderHandoffState, data: FormData) => Promise<OrderHandoffState>;
  initial: Record<string, string>;
  people: { id: string; name: string; role: string }[];
  currentStaffId: string;
  editable: boolean;
};

const field = 'min-h-11 rounded-md border border-input bg-background px-3 text-sm';

export function OrderHandoffForm({ action, initial, people, currentStaffId, editable }: Props) {
  const [state, formAction, pending] = useActionState(action, { values: initial, errors: [], saved: false });
  const values = { ...initial, ...state.values };
  if (!editable) return <p className="mt-3 text-xs text-muted-foreground">Only the current owner or an administrator can change this assignment.</p>;
  return (
    <form action={formAction} className="mt-4 grid gap-3 md:grid-cols-2">
      {state.errors.length > 0 && <p role="alert" className="flex gap-2 border border-destructive/40 p-3 text-sm md:col-span-2"><AlertCircle className="mt-0.5 size-4 shrink-0 text-destructive" />{state.errors.join(' ')}</p>}
      {state.saved && <p role="status" className="flex gap-2 border border-border p-3 text-sm md:col-span-2"><CircleCheck className="mt-0.5 size-4 shrink-0 text-primary" />Assignment saved.</p>}
      <label className="grid gap-2 text-xs font-semibold">Owner
        <select name="assignedTo" defaultValue={values.assignedTo ?? currentStaffId} className={field}>
          <option value="">Unassigned</option>
          {people.map((person) => <option key={person.id} value={person.id}>{person.name} · {person.role}</option>)}
        </select>
      </label>
      <label className="grid gap-2 text-xs font-semibold">Next action due
        <input name="serviceDueAt" type="datetime-local" defaultValue={values.serviceDueAt} className={field} />
      </label>
      <label className="grid gap-2 text-xs font-semibold md:col-span-2">Handoff / scheduling note
        <textarea name="note" maxLength={1000} rows={2} className={`${field} py-3`} placeholder="What is the next action, or why is ownership changing?" />
      </label>
      <button type="submit" disabled={pending} className="action-primary justify-self-start md:col-span-2">{pending ? 'Saving…' : values.assignedTo ? 'Save handoff' : 'Claim / assign order'}</button>
    </form>
  );
}
