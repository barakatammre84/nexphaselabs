'use client';

import { useActionState } from 'react';
import type { LotFormState } from '@/app/manage/lots/actions';

export function QueueAssignmentForm({
  ownerId,
  people,
  due,
  action,
}: {
  ownerId: string;
  people: { id: string; name: string; role: string }[];
  due: string;
  action: (state: LotFormState, data: FormData) => Promise<LotFormState>;
}) {
  const [state, formAction, pending] = useActionState(action, { values: { ownerId, due }, errors: [], violations: [] });
  return (
    <form action={formAction} className="mt-4 grid gap-3 border border-border bg-secondary p-4 text-sm">
      {state.errors.map((error) => <p key={error} role="alert" className="text-destructive">{error}</p>)}
      <label className="grid gap-1">
        Current owner
        <select name="ownerId" defaultValue={state.values.ownerId ?? ownerId} className="h-10 border border-foreground/20 bg-background px-3">
          <option value="">Unassigned</option>
          {people.map((person) => <option key={person.id} value={person.id}>{person.name} · {person.role}</option>)}
        </select>
      </label>
      <label className="grid gap-1">
        Service due
        <input name="due" type="date" defaultValue={state.values.due ?? due} className="h-10 border border-foreground/20 bg-background px-3" />
      </label>
      <button type="submit" disabled={pending} className="action-primary justify-self-start">
        {pending ? 'Saving…' : 'Update assignment'}
      </button>
    </form>
  );
}