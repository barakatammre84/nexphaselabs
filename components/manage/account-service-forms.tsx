'use client';

import { useActionState } from 'react';
import { AlertCircle } from 'lucide-react';
import type { AccountServiceState } from '@/app/manage/accounts/actions';

type Props = {
  action: (prev: AccountServiceState, data: FormData) => Promise<AccountServiceState>;
  status: string;
  liveSessions: number;
};

const input = 'h-11 w-full border border-foreground/20 bg-background px-3 text-sm outline-none focus:border-primary';
const help = 'text-xs leading-5 text-muted-foreground';
const quiet = 'inline-flex h-11 items-center justify-center border border-foreground/20 px-5 text-sm font-semibold hover:border-primary hover:text-primary disabled:opacity-50';

export function AccountServiceForms({ action, status, liveSessions }: Props) {
  const [state, formAction, pending] = useActionState(action, { values: {}, errors: [] });
  const suspended = status === 'suspended';
  const pendingEmail = status === 'pending_email';
  return (
    <div className="flex flex-col gap-6">
      {state.errors.length > 0 && (
        <div role="alert" className="border border-destructive/40 bg-secondary p-4 text-sm">
          <p className="flex items-center gap-2 font-semibold">
            <AlertCircle className="size-4 text-destructive" /> Not done:
          </p>
          <ul className="mt-2 list-disc space-y-1 pl-6">
            {state.errors.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        </div>
      )}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <form action={formAction} className="flex flex-col gap-3 border border-border p-5">
          <input type="hidden" name="op" value="verify" />
          <p className="text-sm font-semibold">Resend verification</p>
          <p className={help}>Issues a fresh 24-hour confirmation link. Only while the address is unverified.</p>
          <button type="submit" disabled={pending || !pendingEmail} className={quiet}>
            Resend verification email
          </button>
        </form>
        <form action={formAction} className="flex flex-col gap-3 border border-border p-5">
          <input type="hidden" name="op" value="reset" />
          <p className="text-sm font-semibold">Send password reset</p>
          <p className={help}>Emails a one-hour reset link. Staff never see or set the customer&rsquo;s password.</p>
          <button type="submit" disabled={pending || suspended || pendingEmail} className={quiet}>
            Email reset link
          </button>
        </form>
        <form action={formAction} className="flex flex-col gap-3 border border-border p-5">
          <input type="hidden" name="op" value={suspended ? 'reinstate' : 'suspend'} />
          <p className="text-sm font-semibold">{suspended ? 'Reinstate' : 'Suspend'}</p>
          <p className={help}>{suspended ? 'Allows sign-in again. Verification status is unchanged.' : 'Refuses sign-in and ends every session. Orders and the organisation record stay.'}</p>
          <input name="reason" placeholder={suspended ? 'Note (optional)' : 'Reason (required)'} maxLength={300} className={input} />
          <button type="submit" disabled={pending} className={quiet}>
            {suspended ? 'Reinstate account' : 'Suspend account'}
          </button>
        </form>
        <form action={formAction} className="flex flex-col gap-3 border border-border p-5">
          <input type="hidden" name="op" value="revoke" />
          <p className="text-sm font-semibold">End sessions</p>
          <p className={help}>
            {liveSessions} live session{liveSessions === 1 ? '' : 's'}. Ends them all; the password is unchanged.
          </p>
          <button type="submit" disabled={pending || liveSessions === 0} className={quiet}>
            End all sessions
          </button>
        </form>
      </div>
    </div>
  );
}
