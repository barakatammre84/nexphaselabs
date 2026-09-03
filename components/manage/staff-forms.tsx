'use client';

import { useActionState } from 'react';
import { AlertCircle, KeyRound } from 'lucide-react';
import type { StaffFormState } from '@/app/manage/staff/actions';
import { STAFF_ROLES } from '@/lib/staff-roles';

const input = 'h-11 w-full border border-foreground/20 bg-background px-3 text-sm outline-none focus:border-primary';
const help = 'text-xs leading-5 text-muted-foreground';
const button = 'inline-flex h-11 items-center justify-center bg-primary px-5 text-sm font-bold text-primary-foreground hover:bg-primary/90 disabled:opacity-50';
const quiet = 'inline-flex h-11 items-center justify-center border border-foreground/20 px-5 text-sm font-semibold hover:border-primary hover:text-primary disabled:opacity-50';

const ROLE_HELP: Record<string, string> = {
  admin: 'Everything, including verification decisions, payments, reports and staff accounts.',
  qc: 'Catalog, lot intake, test results, documents and lot release.',
  ops: 'Lot intake, fulfilment and shipping.',
};

function Problems({ state }: { state: StaffFormState }) {
  if (state.errors.length === 0) return null;
  return (
    <div role="alert" className="border border-destructive/40 bg-secondary p-4 text-sm">
      <p className="flex items-center gap-2 font-semibold">
        <AlertCircle className="size-4 text-destructive" /> Not saved:
      </p>
      <ul className="mt-2 list-disc space-y-1 pl-6">
        {state.errors.map((e) => (
          <li key={e}>{e}</li>
        ))}
      </ul>
    </div>
  );
}

/** The one-time password, shown exactly once in the response to the action that made it. */
export function OneTimePassword({ oneTime }: { oneTime: NonNullable<StaffFormState['oneTime']> }) {
  return (
    <div role="status" className="border-l-2 border-primary bg-secondary p-5 text-sm">
      <p className="flex items-center gap-2 font-semibold">
        <KeyRound className="size-4 text-primary" /> {oneTime.kind === 'created' ? 'Account created.' : 'Password reset.'} Give this one-time password to {oneTime.email} in person or by a channel you trust.
      </p>
      <p className="mt-3 select-all break-all border border-border bg-background p-3 font-mono text-base">{oneTime.password}</p>
      <p className={`mt-3 ${help}`}>It is not stored and cannot be shown again. They must replace it with their own password at first sign-in before seeing anything else.</p>
    </div>
  );
}

export function CreateStaffForm({ action }: { action: (prev: StaffFormState, data: FormData) => Promise<StaffFormState> }) {
  const [state, formAction, pending] = useActionState(action, { values: {}, errors: [] });
  const v = state.values;
  return (
    <div className="flex flex-col gap-5">
      {state.oneTime && <OneTimePassword oneTime={state.oneTime} />}
      <form action={formAction} className="flex flex-col gap-5 border border-border bg-secondary p-5">
        <Problems state={state} />
        <div className="grid gap-5 sm:grid-cols-3">
          <label className="flex flex-col gap-1.5 text-sm font-semibold">
            Name
            <input name="name" defaultValue={v.name ?? ''} required className={input} />
          </label>
          <label className="flex flex-col gap-1.5 text-sm font-semibold">
            Email address
            <input name="email" type="email" defaultValue={v.email ?? ''} required className={input} />
          </label>
          <label className="flex flex-col gap-1.5 text-sm font-semibold">
            Role
            <select name="role" key={`k-${v.role ?? 'ops'}`} defaultValue={v.role ?? 'ops'} className={input}>
              {STAFF_ROLES.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </label>
        </div>
        <ul className={`${help} grid gap-1 sm:grid-cols-3`}>
          {STAFF_ROLES.map((r) => (
            <li key={r}>
              <span className="font-mono">{r}</span> — {ROLE_HELP[r]}
            </li>
          ))}
        </ul>
        <button type="submit" disabled={pending} className={`${button} w-fit`}>
          {pending ? 'Creating…' : 'Create account and issue one-time password'}
        </button>
      </form>
    </div>
  );
}

type AccountProps = {
  action: (prev: StaffFormState, data: FormData) => Promise<StaffFormState>;
  role: string;
  active: boolean;
  isSelf: boolean;
  activeSessions: number;
};

export function StaffAccountForms({ action, role, active, isSelf, activeSessions }: AccountProps) {
  const [state, formAction, pending] = useActionState(action, { values: {}, errors: [] });
  return (
    <div className="flex flex-col gap-6">
      <Problems state={state} />
      {state.oneTime && <OneTimePassword oneTime={state.oneTime} />}

      <form action={formAction} className="grid gap-4 border border-border bg-secondary p-5 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
        <input type="hidden" name="op" value="role" />
        <label className="flex flex-col gap-1.5 text-sm font-semibold">
          Role
          <select name="role" key={`k-${role}`} defaultValue={role} disabled={isSelf} className={input}>
            {STAFF_ROLES.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1.5 text-sm font-semibold">
          Note
          <input name="reason" maxLength={300} disabled={isSelf} className={input} />
        </label>
        <button type="submit" disabled={pending || isSelf} className={button}>
          Change role
        </button>
        {isSelf && <p className={`${help} sm:col-span-3`}>You cannot change your own role.</p>}
      </form>

      <div className="grid gap-4 sm:grid-cols-3">
        <form action={formAction} className="flex flex-col gap-3 border border-border p-5">
          <input type="hidden" name="op" value={active ? 'deactivate' : 'reactivate'} />
          <p className="text-sm font-semibold">{active ? 'Deactivate' : 'Reactivate'}</p>
          <p className={help}>{active ? 'Ends every session and refuses sign-in. The record and its history stay.' : 'Allows sign-in again with the existing password.'}</p>
          {active && <input name="reason" placeholder="Reason (required)" maxLength={300} disabled={isSelf} className={input} />}
          <button type="submit" disabled={pending || isSelf} className={quiet}>
            {active ? 'Deactivate account' : 'Reactivate account'}
          </button>
        </form>
        <form action={formAction} className="flex flex-col gap-3 border border-border p-5">
          <input type="hidden" name="op" value="reset" />
          <p className="text-sm font-semibold">Reset password</p>
          <p className={help}>Issues a new one-time password (shown once, here) and ends every session. Use when a password is forgotten or exposed.</p>
          <button type="submit" disabled={pending || !active || isSelf} className={quiet}>
            Issue one-time password
          </button>
          {isSelf && <p className={help}>Change your own password from the Password link instead.</p>}
        </form>
        <form action={formAction} className="flex flex-col gap-3 border border-border p-5">
          <input type="hidden" name="op" value="revoke" />
          <p className="text-sm font-semibold">End sessions</p>
          <p className={help}>
            {activeSessions} live session{activeSessions === 1 ? '' : 's'}.{' '}
            {isSelf ? 'Ends your other sessions; this one continues. The password is unchanged.' : 'Ends them all; the password is unchanged.'}
          </p>
          <button type="submit" disabled={pending || (isSelf ? activeSessions <= 1 : activeSessions === 0)} className={quiet}>
            {isSelf ? 'End my other sessions' : 'End all sessions'}
          </button>
        </form>
      </div>
    </div>
  );
}
