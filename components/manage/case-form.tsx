'use client';

import Link from 'next/link';
import { useActionState } from 'react';
import { AlertCircle, CircleCheck } from 'lucide-react';
import type { CaseFormState } from '@/app/manage/cases/actions';
import {
  CASE_SEVERITIES,
  CASE_STATUSES,
  CASE_STATUS_LABEL,
  CASE_TYPES,
  CASE_TYPE_LABEL,
  type CaseStatus,
  type CaseType,
} from '@/lib/operational-case-rules';

type Props = {
  action: (previous: CaseFormState, data: FormData) => Promise<CaseFormState>;
  initial?: Record<string, string>;
  people: { id: string; name: string; role: string }[];
  staff: { id: string; role: string };
  mode: 'create' | 'edit';
  editable?: boolean;
};

const inputClass =
  'min-h-11 w-full rounded-md border border-input bg-background px-3 text-sm disabled:opacity-60';

export function CaseForm({ action, initial = {}, people, staff, mode, editable = true }: Props) {
  const [state, formAction, pending] = useActionState(action, {
    values: initial,
    errors: [],
    saved: false,
  });
  const values = { ...initial, ...state.values };
  const admin = staff.role === 'admin';
  if (!editable) {
    return <p className="mt-5 text-sm text-muted-foreground">Only the assigned owner or an administrator can update this case.</p>;
  }
  return (
    <form action={formAction} className="mt-6 grid gap-4 md:grid-cols-2">
      {state.errors.length > 0 && (
        <p role="alert" className="flex gap-2 border border-destructive/40 bg-secondary p-4 text-sm md:col-span-2">
          <AlertCircle className="mt-0.5 size-4 shrink-0 text-destructive" />
          {state.errors.join(' ')}
        </p>
      )}
      {state.saved && (
        <p role="status" className="flex gap-2 border border-border bg-secondary p-4 text-sm md:col-span-2">
          <CircleCheck className="mt-0.5 size-4 shrink-0 text-primary" />
          Saved.{mode === 'create' && state.caseNumber ? <>&nbsp;<Link className="font-semibold text-primary underline" href={`/manage/cases/${state.caseNumber}`}>Open {state.caseNumber}</Link></> : null}
        </p>
      )}
      <label className="grid gap-2 text-sm font-semibold">
        Type
        <select name="type" defaultValue={values.type ?? 'deviation'} className={inputClass}>
          {CASE_TYPES.map((value) => <option key={value} value={value}>{CASE_TYPE_LABEL[value as CaseType]}</option>)}
        </select>
      </label>
      <label className="grid gap-2 text-sm font-semibold">
        Severity
        <select name="severity" defaultValue={values.severity ?? 'medium'} className={inputClass}>
          {CASE_SEVERITIES.map((value) => <option key={value} value={value}>{value[0].toUpperCase() + value.slice(1)}</option>)}
        </select>
      </label>
      {mode === 'edit' && (
        <label className="grid gap-2 text-sm font-semibold">
          Status
          <select name="status" defaultValue={values.status} className={inputClass}>
            {CASE_STATUSES.map((value) => <option key={value} value={value}>{CASE_STATUS_LABEL[value as CaseStatus]}</option>)}
          </select>
        </label>
      )}
      {mode === 'create' && <input type="hidden" name="status" value="open" />}
      <label className="grid gap-2 text-sm font-semibold">
        Owner
        <select name="ownerId" defaultValue={values.ownerId ?? staff.id} disabled={!admin} className={inputClass}>
          {people.map((person) => <option key={person.id} value={person.id}>{person.name} · {person.role}</option>)}
        </select>
        {!admin && <input type="hidden" name="ownerId" value={values.ownerId ?? staff.id} />}
      </label>
      <label className="grid gap-2 text-sm font-semibold md:col-span-2">
        Title
        <input name="title" defaultValue={values.title} maxLength={160} required className={inputClass} />
      </label>
      <label className="grid gap-2 text-sm font-semibold md:col-span-2">
        What happened / scope
        <textarea name="summary" defaultValue={values.summary} maxLength={3000} required rows={4} className={`${inputClass} py-3`} />
      </label>
      <label className="grid gap-2 text-sm font-semibold">
        Due date
        <input name="dueOn" type="date" defaultValue={values.dueOn} required className={inputClass} />
      </label>
      <label className="grid gap-2 text-sm font-semibold">
        Evidence link
        <input name="evidenceUrl" type="url" defaultValue={values.evidenceUrl} maxLength={500} placeholder="https://…" className={inputClass} />
      </label>
      <label className="grid gap-2 text-sm font-semibold">
        Linked lot number
        <input name="linkedLotNumber" defaultValue={values.linkedLotNumber} maxLength={120} className={inputClass} />
      </label>
      <label className="grid gap-2 text-sm font-semibold">
        Linked order number
        <input name="linkedOrderNumber" defaultValue={values.linkedOrderNumber} maxLength={120} className={inputClass} />
      </label>
      <label className="grid gap-2 text-sm font-semibold md:col-span-2">
        Linked supplier ID
        <input name="linkedSupplierId" defaultValue={values.linkedSupplierId} maxLength={120} className={inputClass} />
      </label>
      {[
        ['containment', 'Containment taken'],
        ['rootCause', 'Root cause'],
        ['correctiveAction', 'Corrective action'],
        ['preventiveAction', 'Preventive action'],
        ['effectivenessCheck', 'Effectiveness check'],
        ['closureSummary', 'Closure summary'],
      ].map(([name, label]) => (
        <label key={name} className="grid gap-2 text-sm font-semibold md:col-span-2">
          {label}
          <textarea name={name} defaultValue={values[name]} maxLength={3000} rows={3} className={`${inputClass} py-3`} />
        </label>
      ))}
      <label className="grid gap-2 text-sm font-semibold md:col-span-2">
        Change note
        <textarea name="note" defaultValue={mode === 'create' ? values.note : ''} maxLength={1000} rows={2} className={`${inputClass} py-3`} />
      </label>
      <p className="text-xs leading-5 text-muted-foreground md:col-span-2">
        High and critical cases need containment before they progress. Recalls require a linked lot already on hold or withdrawn. Closing requires root cause, corrective action, evidence, an effectiveness check and a closure summary; only an administrator can close.
      </p>
      <button type="submit" disabled={pending} className="action-primary md:col-span-2 md:justify-self-start">
        {pending ? 'Saving…' : mode === 'create' ? 'Open case' : 'Save case'}
      </button>
    </form>
  );
}
