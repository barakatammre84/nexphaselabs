'use client';

import { useActionState } from 'react';
import { AlertCircle } from 'lucide-react';
import type { ClassFormState } from '@/app/manage/classes/actions';

type Props = {
  initial: Record<string, string>;
  mode: 'create' | 'update';
  action: (prev: ClassFormState, data: FormData) => Promise<ClassFormState>;
};

const input =
  'h-11 w-full border border-foreground/20 bg-background px-3 text-sm outline-none focus:border-primary';
const help = 'text-xs leading-5 text-muted-foreground';

export function ClassForm({ initial, mode, action }: Props) {
  const [state, formAction, pending] = useActionState(action, {
    values: initial,
    errors: [],
    violations: [],
  });
  const v = state.values;
  const problems = state.errors.length + state.violations.length;

  return (
    <form action={formAction} className="flex flex-col gap-6">
      {problems > 0 && (
        <div
          role="alert"
          className="border border-destructive/40 bg-secondary p-5"
        >
          <p className="flex items-center gap-2 text-sm font-semibold">
            <AlertCircle className="size-4 text-destructive" /> Not saved.{' '}
            {problems} {problems === 1 ? 'problem' : 'problems'} to fix:
          </p>
          <ul className="mt-3 list-disc space-y-1 pl-6 text-sm">
            {state.errors.map((e) => (
              <li key={e}>{e}</li>
            ))}
            {state.violations.map((x) => (
              <li key={`${x.field}-${x.match}`}>
                <span className="font-mono text-xs">{x.field}</span>: contains{' '}
                {x.reason} (&ldquo;{x.match}&rdquo;).
              </li>
            ))}
          </ul>
        </div>
      )}
      <div className="grid gap-6 lg:grid-cols-2">
        <label className="flex flex-col gap-1.5 text-sm font-semibold">
          Anchor <span className="font-normal text-primary">*</span>
          <input
            name="id"
            defaultValue={v.id ?? ''}
            readOnly={mode === 'update'}
            className={`${input} font-mono ${mode === 'update' ? 'text-muted-foreground' : ''}`}
          />
          <span className={help}>
            Lowercase, hyphens. Becomes the URL anchor (/catalog#peptides).
            Fixed once created.
          </span>
        </label>
        <label className="flex flex-col gap-1.5 text-sm font-semibold">
          Name <span className="font-normal text-primary">*</span>
          <input name="name" defaultValue={v.name ?? ''} className={input} />
          <span className={help}>
            What the material is: a chemical class. Never an indication, effect
            or research area.
          </span>
        </label>
        <label className="flex flex-col gap-1.5 text-sm font-semibold lg:col-span-2">
          Description
          <textarea
            name="blurb"
            defaultValue={v.blurb ?? ''}
            className="min-h-[5rem] w-full border border-foreground/20 bg-background p-3 text-sm outline-none focus:border-primary"
          />
          <span className={help}>
            Shown under the class heading on the catalog index. Chemistry and
            documentation only.
          </span>
        </label>
        <label className="flex flex-col gap-1.5 text-sm font-semibold">
          Display order
          <input
            name="sortOrder"
            defaultValue={v.sortOrder ?? '0'}
            inputMode="numeric"
            className={`${input} font-mono`}
          />
          <span className={help}>Lower numbers appear first.</span>
        </label>
        <label className="flex items-center gap-2 pt-7 text-sm">
          <input
            type="checkbox"
            name="active"
            defaultChecked={v.active === undefined || v.active === 'on'}
          />{' '}
          Active (offered in the product form and shown on the site)
        </label>
        <label className="flex flex-col gap-1.5 text-sm font-semibold lg:col-span-2">
          Change note
          <input name="note" defaultValue="" className={input} />
          <span className={help}>Recorded with this revision.</span>
        </label>
      </div>
      <div className="flex items-center gap-4 border-t border-border pt-6">
        <button
          type="submit"
          disabled={pending}
          className="inline-flex h-12 items-center bg-primary px-6 text-sm font-bold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          {pending
            ? 'Saving…'
            : mode === 'create'
              ? 'Create class'
              : 'Save class'}
        </button>
        <p className={help}>
          Classes are never deleted. A rename moves every product in the class
          with it.
        </p>
      </div>
    </form>
  );
}
