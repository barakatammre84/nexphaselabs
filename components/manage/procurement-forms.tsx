'use client';

import { useActionState } from 'react';
import { AlertCircle } from 'lucide-react';
import type { ProcurementFormState } from '@/app/manage/procurement/actions';

type Action = (prev: ProcurementFormState, data: FormData) => Promise<ProcurementFormState>;
const input = 'h-11 w-full border border-foreground/20 bg-background px-3 text-sm outline-none focus:border-primary';
const help = 'text-xs leading-5 text-muted-foreground';
const primary = 'inline-flex h-11 items-center bg-primary px-5 text-sm font-bold text-primary-foreground hover:bg-primary/90 disabled:opacity-50';
const quiet = 'inline-flex h-11 items-center border border-foreground/20 px-5 text-sm font-semibold hover:border-primary hover:text-primary disabled:opacity-50';

function Problems({ state }: { state: ProcurementFormState }) {
  const n = state.errors.length + state.violations.length;
  if (n === 0) return null;
  return (
    <div role="alert" className="border border-destructive/40 bg-secondary p-4 text-sm">
      <p className="flex items-center gap-2 font-semibold">
        <AlertCircle className="size-4 text-destructive" /> Not saved. {n} {n === 1 ? 'problem' : 'problems'} to fix:
      </p>
      <ul className="mt-2 list-disc space-y-1 pl-6">
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
  );
}

export function SupplierForm({ initial, mode, action }: { initial: Record<string, string>; mode: 'create' | 'update'; action: Action }) {
  const [state, formAction, pending] = useActionState(action, { values: initial, errors: [], violations: [] });
  const v = { ...initial, ...state.values };
  const F = ({ name, title, hint, multiline = false }: { name: string; title: string; hint?: string; multiline?: boolean }) => (
    <label className="flex flex-col gap-1.5 text-sm font-semibold">
      {title}
      {multiline ? (
        <textarea name={name} defaultValue={v[name] ?? ''} className="min-h-[4rem] w-full border border-foreground/20 bg-background p-3 text-sm outline-none focus:border-primary" />
      ) : (
        <input name={name} defaultValue={v[name] ?? ''} className={input} />
      )}
      {hint && <span className={help}>{hint}</span>}
    </label>
  );
  return (
    <form action={formAction} className="flex flex-col gap-6">
      <Problems state={state} />
      <div className="grid gap-5 lg:grid-cols-2">
        <F name="name" title="Legal name *" hint="As it appears on invoices and certificates." />
        <F name="country" title="Country" />
        <F name="address" title="Address" multiline />
        <F name="website" title="Website" />
        <F name="contactName" title="Contact" />
        <F name="contactEmail" title="Contact email" />
        <F name="phone" title="Phone" />
        <F name="notes" title="Notes" multiline hint="Qualification evidence, audit dates, documents held. Never product claims." />
      </div>
      <div className="flex items-center gap-4 border-t border-border pt-6">
        <button type="submit" disabled={pending} className={primary}>
          {pending ? 'Saving…' : mode === 'create' ? 'Create supplier' : 'Save supplier'}
        </button>
        <p className={help}>Suppliers are never deleted. Every change is recorded with who made it.</p>
      </div>
    </form>
  );
}

export function QualificationForm({ status, action }: { status: string; action: Action }) {
  const [state, formAction, pending] = useActionState(action, { values: {}, errors: [], violations: [] });
  const to = status === 'qualified' ? 'suspended' : 'qualified';
  return (
    <form action={formAction} className="flex flex-col gap-3 border border-border bg-secondary p-5">
      <Problems state={state} />
      <input type="hidden" name="to" value={to} />
      <p className="text-sm font-semibold">{to === 'qualified' ? (status === 'suspended' ? 'Re-qualify supplier' : 'Qualify supplier') : 'Suspend supplier'}</p>
      <p className={help}>
        {to === 'qualified'
          ? 'Record what was reviewed (certificates, audit, references). Purchase orders can only be raised on a qualified supplier.'
          : 'No new purchase orders until re-qualified. Open orders and received lots are unaffected.'}
      </p>
      <input name="reason" required maxLength={500} placeholder="Reason / evidence reviewed" className={input} />
      <button type="submit" disabled={pending} className={to === 'qualified' ? primary : quiet}>
        {to === 'qualified' ? 'Record qualification' : 'Suspend'}
      </button>
    </form>
  );
}

export type ProductOption = { code: string; name: string };

export function PurchaseOrderForm({ suppliers, products, today, action }: { suppliers: { id: string; name: string }[]; products: ProductOption[]; today: string; action: Action }) {
  const [state, formAction, pending] = useActionState(action, { values: { orderedOn: today }, errors: [], violations: [] });
  const v = state.values;
  return (
    <form action={formAction} className="flex flex-col gap-8">
      <Problems state={state} />
      <section className="grid gap-5 lg:grid-cols-2">
        <h2 className="utility-label text-primary lg:col-span-2">Order</h2>
        <label className="flex flex-col gap-1.5 text-sm font-semibold">
          Supplier *
          <select name="supplierId" key={`k-${v.supplierId ?? ''}`} defaultValue={v.supplierId ?? ''} className={input}>
            <option value="">Choose a qualified supplier…</option>
            {suppliers.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1.5 text-sm font-semibold">
          Supplier reference
          <input name="supplierReference" defaultValue={v.supplierReference ?? ''} className={input} />
        </label>
        <label className="flex flex-col gap-1.5 text-sm font-semibold">
          Order date
          <input name="orderedOn" type="date" defaultValue={v.orderedOn ?? today} className={input} />
        </label>
        <label className="flex flex-col gap-1.5 text-sm font-semibold">
          Expected delivery
          <input name="expectedOn" type="date" defaultValue={v.expectedOn ?? ''} className={input} />
        </label>
        <label className="flex flex-col gap-1.5 text-sm font-semibold">
          Freight (USD)
          <input name="freight" defaultValue={v.freight ?? ''} inputMode="decimal" className={input} />
          <span className={help}>Allocated to lines by line cost when a lot is received.</span>
        </label>
        <label className="flex flex-col gap-1.5 text-sm font-semibold">
          Duty and customs (USD)
          <input name="duty" defaultValue={v.duty ?? ''} inputMode="decimal" className={input} />
        </label>
        <label className="flex flex-col gap-1.5 text-sm font-semibold lg:col-span-2">
          Note
          <input name="note" defaultValue={v.note ?? ''} maxLength={1000} className={input} />
        </label>
      </section>
      <section className="flex flex-col gap-3">
        <h2 className="utility-label text-primary">Lines</h2>
        <div className="grid grid-cols-[1fr_140px_140px] gap-3 text-xs font-semibold text-muted-foreground">
          <span>Product</span>
          <span>Quantity</span>
          <span>Line cost (USD)</span>
        </div>
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="grid grid-cols-[1fr_140px_140px] gap-3">
            <select name={`line_${i}_product`} key={`k-${v[`line_${i}_product`] ?? ''}`} defaultValue={v[`line_${i}_product`] ?? ''} className={input}>
              <option value="">—</option>
              {products.map((p) => (
                <option key={p.code} value={p.code}>
                  {p.code} · {p.name}
                </option>
              ))}
            </select>
            <input name={`line_${i}_quantity`} defaultValue={v[`line_${i}_quantity`] ?? ''} placeholder="25 g" className={`${input} font-mono`} />
            <input name={`line_${i}_cost`} defaultValue={v[`line_${i}_cost`] ?? ''} placeholder="1200.00" inputMode="decimal" className={`${input} font-mono`} />
          </div>
        ))}
        <p className={help}>Quantity with unit as the supplier states it (g, mg, kg, vials). Line cost is material only; freight and duty are above.</p>
      </section>
      <div className="flex items-center gap-4 border-t border-border pt-6">
        <button type="submit" disabled={pending} className={primary}>
          {pending ? 'Saving…' : 'Create draft order'}
        </button>
        <p className={help}>Created as a draft. Send it to make its lines available as expected receipts at lot intake.</p>
      </div>
    </form>
  );
}

export function PoTransitionForm({ to, label, action, needsNote = false }: { to: string; label: string; action: Action; needsNote?: boolean }) {
  const [state, formAction, pending] = useActionState(action, { values: {}, errors: [], violations: [] });
  return (
    <form action={formAction} className="flex flex-wrap items-center gap-3">
      {state.errors.length > 0 && (
        <p role="alert" className="w-full text-sm text-destructive">
          {state.errors.join(' ')}
        </p>
      )}
      <input type="hidden" name="to" value={to} />
      {needsNote && <input name="note" required maxLength={300} placeholder="Reason" className="h-11 min-w-[16rem] border border-foreground/20 bg-background px-3 text-sm" />}
      <button type="submit" disabled={pending} className={to === 'cancelled' ? quiet : primary}>
        {label}
      </button>
    </form>
  );
}
