'use client';

import { useActionState } from 'react';
import { AlertCircle } from 'lucide-react';
import type { LotFormState } from '@/app/manage/lots/actions';

type ProductOption = { code: string; name: string };

type Props = {
  products: ProductOption[];
  today: string;
  action: (prev: LotFormState, data: FormData) => Promise<LotFormState>;
};

const input = 'h-11 w-full border border-foreground/20 bg-background px-3 font-mono text-sm outline-none focus:border-primary';
const area = 'min-h-[5rem] w-full border border-foreground/20 bg-background p-3 font-mono text-sm outline-none focus:border-primary';
const label = 'text-sm font-semibold';
const help = 'text-xs leading-5 text-muted-foreground';

function Field({
  name,
  title,
  hint,
  values,
  type = 'text',
  multiline = false,
  required = false,
}: {
  name: string;
  title: string;
  hint?: string;
  values: Record<string, string>;
  type?: string;
  multiline?: boolean;
  required?: boolean;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={name} className={label}>
        {title}
        {required && <span className="text-primary"> *</span>}
      </label>
      {multiline ? (
        <textarea id={name} name={name} defaultValue={values[name] ?? ''} className={area} />
      ) : (
        <input id={name} name={name} type={type} defaultValue={values[name] ?? ''} className={input} />
      )}
      {hint && <p className={help}>{hint}</p>}
    </div>
  );
}

export function LotForm({ products, today, action }: Props) {
  const [state, formAction, pending] = useActionState(action, {
    values: { receivedAt: today },
    errors: [],
    violations: [],
  });
  const v = state.values;
  const problems = state.errors.length + state.violations.length;

  return (
    <form action={formAction} className="flex flex-col gap-10">
      {problems > 0 && (
        <div role="alert" className="border border-destructive/40 bg-secondary p-5">
          <p className="flex items-center gap-2 text-sm font-semibold">
            <AlertCircle className="size-4 text-destructive" />
            Not recorded. {problems} {problems === 1 ? 'problem' : 'problems'} to fix:
          </p>
          <ul className="mt-3 list-disc space-y-1 pl-6 text-sm">
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
      )}

      <section className="grid gap-6 lg:grid-cols-2">
        <h2 className="utility-label text-primary lg:col-span-2">Material</h2>
        <Field name="lotNumber" title="Lot number" values={v} required hint="As printed on the container label. Letters, digits, hyphens." />
        <div className="flex flex-col gap-1.5">
          <label htmlFor="productCode" className={label}>
            Catalog product <span className="text-primary">*</span>
          </label>
          <select id="productCode" name="productCode" defaultValue={v.productCode ?? ''} className={input}>
            <option value="">Choose…</option>
            {products.map((p) => (
              <option key={p.code} value={p.code}>
                {p.code} · {p.name}
              </option>
            ))}
          </select>
          <p className={help}>Product name and CAS are copied onto the lot record so it stays readable if the catalog changes.</p>
        </div>
        <Field name="quantityReceived" title="Quantity received" values={v} required hint='Number with unit: "25 g", "40 vials".' />
        <Field name="receivedAt" title="Date received" values={v} type="date" required hint="The actual date material arrived, not the order date." />
      </section>

      <section className="grid gap-6 lg:grid-cols-2">
        <h2 className="utility-label text-primary lg:col-span-2">Provenance</h2>
        <Field name="manufacturerName" title="Manufacturer" values={v} hint="The manufacturer named on the COA — not the distributor. Required before release (16 CCR 1736.9(d))." />
        <Field name="manufacturerAddress" title="Manufacturer address" values={v} multiline />
        <Field name="supplierName" title="Supplier (if different)" values={v} />
        <Field name="countryOfOrigin" title="Country of origin" values={v} />
        <Field name="entryNumber" title="Customs entry number" values={v} />
        <Field name="manufactureDate" title="Date of manufacture" values={v} type="date" />
      </section>

      <section className="grid gap-6 lg:grid-cols-2">
        <h2 className="utility-label text-primary lg:col-span-2">Storage</h2>
        <Field name="storageLocation" title="Storage location" values={v} hint="Freezer or shelf identifier." />
        <Field name="storageCondition" title="Storage condition" values={v} hint='e.g. "Minus 20 C, desiccated".' />
        <Field name="retestDate" title="Retest date" values={v} type="date" />
        <Field name="note" title="Receiving note" values={v} multiline hint="Condition on arrival, seal integrity, discrepancies. Goes on the receipt movement." />
      </section>

      <div className="flex items-center gap-4 border-t border-border pt-6">
        <button
          type="submit"
          disabled={pending}
          className="inline-flex h-12 items-center justify-center bg-primary px-6 text-sm font-bold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
        >
          {pending ? 'Recording…' : 'Record receipt'}
        </button>
        <p className={help}>The lot enters quarantine. It cannot be sold until a named person releases it.</p>
      </div>
    </form>
  );
}
