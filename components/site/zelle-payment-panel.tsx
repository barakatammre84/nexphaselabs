'use client';

import { Check, Clock3, Copy, Landmark, ShieldCheck } from 'lucide-react';
import { useState } from 'react';
import { ENTITY } from '@/lib/entity';

function CopyField({
  label,
  value,
  copyValue = value,
}: {
  label: string;
  value: string;
  copyValue?: string;
}) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(copyValue);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  }
  return (
    <div className="border-b border-border py-4 last:border-b-0">
      <p className="text-xs font-semibold text-muted-foreground">{label}</p>
      <div className="mt-1 flex items-center justify-between gap-4">
        <p className="min-w-0 break-words font-mono text-sm font-semibold sm:text-base">
          {value}
        </p>
        <button
          type="button"
          onClick={copy}
          className="inline-flex min-h-10 shrink-0 items-center gap-2 border border-border bg-background px-3 text-xs font-semibold hover:border-primary hover:text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
          aria-label={`Copy ${label.toLowerCase()}`}
        >
          {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
    </div>
  );
}

export function ZellePaymentPanel({
  details,
  claimAction,
  claimedAt,
}: {
  details: {
    recipientEmail: string;
    recipientName: string;
    amountCents: number;
    currency: string;
    memo: string;
    qrImagePath: string | null;
    simulated?: boolean;
  };
  claimAction: string;
  claimedAt: string | null;
}) {
  const amount = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: details.currency,
  }).format(details.amountCents / 100);
  const simulated = details.simulated === true;
  return (
    <section className="mt-10 overflow-hidden border border-border bg-secondary" aria-labelledby="zelle-heading">
      <div className="border-b border-border bg-primary px-6 py-5 text-primary-foreground">
        <div className="flex items-center gap-3">
          <Landmark className="size-5" />
          <h2 id="zelle-heading" className="font-display text-xl font-bold tracking-tight">
            {simulated ? 'Zelle checkout rehearsal' : 'Pay with Zelle'}
          </h2>
        </div>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-primary-foreground/85">
          {simulated
            ? 'Test only. Do not open your bank or send money. These fake details exercise the customer claim and staff review workflow.'
            : 'Use these exact details in your bank. We begin preparation after the Chase receipt is matched.'}
        </p>
      </div>
      <div className="grid gap-0 md:grid-cols-[1fr_220px]">
        <div className="px-6 py-2">
          <CopyField
            label="Amount"
            value={`${amount} ${details.currency}`}
            copyValue={(details.amountCents / 100).toFixed(2)}
          />
          <CopyField label="Send to" value={details.recipientEmail} />
          <CopyField label="Recipient name" value={details.recipientName} />
          {details.recipientName.toLowerCase() !==
          ENTITY.tradingName.toLowerCase() ? (
            <p className="pb-3 text-xs leading-5 text-muted-foreground">
              {details.recipientName} is the legal entity behind{' '}
              {ENTITY.tradingName}. Your bank will show that name, not the shop
              name.
            </p>
          ) : null}
          <CopyField label="Memo" value={details.memo} />
        </div>
        <aside className="border-t border-border bg-background p-6 md:border-l md:border-t-0">
          {details.qrImagePath ? (
            <div className="mx-auto w-fit border border-border bg-white p-3">
              <img
                src={details.qrImagePath}
                alt={`Official Chase Zelle QR code for ${details.recipientName}`}
                width={176}
                height={176}
              />
            </div>
          ) : (
            <div className="flex aspect-square items-center justify-center border border-dashed border-border p-5 text-center text-xs leading-5 text-muted-foreground">
              {simulated
                ? 'No bank action is needed. Continue below to create a test payment claim.'
                : 'Open Zelle in your bank and enter the email shown here.'}
            </div>
          )}
          <p className="mt-4 flex gap-2 text-xs leading-5 text-muted-foreground">
            <ShieldCheck className="mt-0.5 size-4 shrink-0 text-primary" />
            {simulated ? (
              <>The recipient and memo are deliberately fake. No money moves.</>
            ) : (
              <>Confirm your bank shows <strong className="text-foreground">{details.recipientName}</strong> before sending.</>
            )}
          </p>
        </aside>
      </div>
      <div className="border-t border-border bg-background p-6">
        {claimedAt ? (
          <div role="status" className="flex gap-3">
            <Clock3 className="mt-0.5 size-5 shrink-0 text-primary" />
            <div>
              <p className="font-semibold">
                {simulated ? 'Test payment claim recorded' : 'Payment reported sent'}
              </p>
              <p className="mt-1 text-sm leading-6 text-muted-foreground">
                {simulated
                  ? 'The order remains unpaid until a staff member reviews and records the simulated payment.'
                  : 'We are checking Chase for this exact payment. Do not send it again. Confirmation usually appears within five minutes; a mismatch is reviewed by our team.'}
              </p>
            </div>
          </div>
        ) : (
          <form method="post" action={claimAction} className="grid gap-4 sm:grid-cols-[1fr_auto] sm:items-end">
            <label className="grid gap-1.5 text-sm font-semibold">
              Name on the sending bank account <span className="font-normal text-muted-foreground">(optional)</span>
              <input
                name="payer_name"
                maxLength={120}
                autoComplete="name"
                className="h-11 border border-foreground/20 bg-background px-3 text-sm"
              />
            </label>
            <button type="submit" className="action-primary min-h-11">
              {simulated ? 'Report simulated Zelle payment' : 'I sent this Zelle payment'}
            </button>
          </form>
        )}
        <p className="mt-4 text-xs leading-5 text-muted-foreground">
          {simulated
            ? 'This creates test evidence for staff review. It never checks Chase or marks the order paid.'
            : 'This button asks us to check the bank; it does not mark the order paid. Zelle payments are generally final and do not include purchase protection.'}
        </p>
      </div>
    </section>
  );
}
