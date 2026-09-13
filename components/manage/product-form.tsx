'use client';

import { useActionState } from 'react';
import { AlertCircle } from 'lucide-react';
import type { ProductFormState } from '@/app/manage/products/actions';
import { STATUS_LABEL } from '@/lib/catalog';
import type { FormValues } from '@/lib/catalog-form';
import { LAB_SOLVENTS, PRESENTATIONS, VISIBILITIES } from '@/lib/catalog-rules';

type Props = {
  initial: FormValues;
  mode: 'create' | 'update';
  /** Active chemical classes from the database. */
  classes: string[];
  action: (prev: ProductFormState, data: FormData) => Promise<ProductFormState>;
};

const input =
  'h-11 w-full border border-foreground/20 bg-background px-3 font-mono text-sm outline-none focus:border-primary';
const area =
  'min-h-[7rem] w-full border border-foreground/20 bg-background p-3 font-mono text-sm outline-none focus:border-primary';
const label = 'text-sm font-semibold';
const help = 'text-xs leading-5 text-muted-foreground';

function Field({
  name,
  title,
  hint,
  values,
  multiline = false,
  required = false,
  readOnly = false,
}: {
  name: keyof FormValues & string;
  title: string;
  hint?: string;
  values: FormValues;
  multiline?: boolean;
  required?: boolean;
  readOnly?: boolean;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={name} className={label}>
        {title}
        {required && <span className="text-primary"> *</span>}
      </label>
      {multiline ? (
        <textarea
          id={name}
          name={name}
          defaultValue={values[name] ?? ''}
          className={area}
          readOnly={readOnly}
        />
      ) : (
        <input
          id={name}
          name={name}
          defaultValue={values[name] ?? ''}
          className={input}
          readOnly={readOnly}
        />
      )}
      {hint && <p className={help}>{hint}</p>}
    </div>
  );
}

export function ProductForm({ initial, mode, classes, action }: Props) {
  const [state, formAction, pending] = useActionState(action, {
    values: initial,
    errors: [],
    violations: [],
  });
  const v = state.values;
  const problems = state.errors.length + state.violations.length;

  return (
    <form action={formAction} className="flex flex-col gap-10">
      {problems > 0 && (
        <div
          role="alert"
          className="border border-destructive/40 bg-secondary p-5"
        >
          <p className="flex items-center gap-2 text-sm font-semibold">
            <AlertCircle className="size-4 text-destructive" />
            Not saved. {problems} {problems === 1 ? 'problem' : 'problems'} to
            fix:
          </p>
          <ul className="mt-3 list-disc space-y-1 pl-6 text-sm">
            {state.errors.map((e) => (
              <li key={e}>{e}</li>
            ))}
            {state.violations.map((x) => (
              <li key={`${x.field}-${x.match}`}>
                <span className="font-mono text-xs">{x.field}</span>: contains{' '}
                {x.reason} (&ldquo;{x.match}&rdquo;). This language is not
                permitted on the site.
              </li>
            ))}
          </ul>
        </div>
      )}

      <section className="grid gap-6 lg:grid-cols-2">
        <h2 className="utility-label text-primary lg:col-span-2">Identity</h2>
        <Field
          name="code"
          title="Catalog code"
          values={v}
          required
          readOnly={mode === 'update'}
          hint="NPL-001. Fixed once created; lot records reference it."
        />
        <Field
          name="slug"
          title="URL slug"
          values={v}
          required
          hint="lowercase-with-hyphens"
        />
        <Field
          name="name"
          title="Name"
          values={v}
          required
          hint="The chemical identity. Not a brand code, not a blend."
        />
        <Field
          name="formalName"
          title="Formal (IUPAC / peptide) name"
          values={v}
          required
        />
        <Field
          name="synonyms"
          title="Synonyms"
          values={v}
          hint="Comma-separated. Registry synonyms only."
        />
        <div className="flex flex-col gap-1.5">
          <label htmlFor="chemicalClass" className={label}>
            Chemical class <span className="text-primary">*</span>
          </label>
          <select
            id="chemicalClass"
            name="chemicalClass"
            key={`k-${v.chemicalClass || classes[0] || ''}`} defaultValue={v.chemicalClass || classes[0] || ''}
            className={input}
          >
            {classes.length === 0 && (
              <option value="">
                No active classes — add one under Classes
              </option>
            )}
            {classes.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
            {v.chemicalClass && !classes.includes(v.chemicalClass) && (
              <option value={v.chemicalClass} disabled>
                {v.chemicalClass} (inactive class — choose an active one)
              </option>
            )}
          </select>
          <p className={help}>
            The only classification axis. Classes are managed under Classes;
            never an indication or research area.
          </p>
        </div>
      </section>

      <section className="grid gap-6 lg:grid-cols-2">
        <h2 className="utility-label text-primary lg:col-span-2">
          Chemical identity
        </h2>
        <Field
          name="casNumber"
          title="CAS number"
          values={v}
          required
          hint="Checked against the CAS check digit."
        />
        <Field
          name="relatedCas"
          title="Related CAS numbers"
          values={v}
          multiline
          hint={'One per line: form | CAS\nAcetate salt | 1628202-19-6'}
        />
        <Field
          name="sequenceOneLetter"
          title="Sequence (one-letter)"
          values={v}
        />
        <Field
          name="sequenceThreeLetter"
          title="Sequence (three-letter)"
          values={v}
        />
        <Field
          name="molecularFormula"
          title="Molecular formula"
          values={v}
          required
        />
        <Field
          name="molecularWeight"
          title="Molecular weight"
          values={v}
          required
          hint="e.g. 1419.5 g/mol"
        />
        <Field name="exactMass" title="Exact mass" values={v} />
        <Field name="smiles" title="SMILES" values={v} />
        <Field name="inchiKey" title="InChI Key" values={v} />
        <Field name="pubchemCid" title="PubChem CID" values={v} />
      </section>

      <section className="grid gap-6 lg:grid-cols-2">
        <h2 className="utility-label text-primary lg:col-span-2">
          Specification and handling
        </h2>
        <Field
          name="purity"
          title="Purity"
          values={v}
          required
          hint="Must name the analytical method, e.g. 'Greater than or equal to 95% by HPLC'."
        />
        <Field name="form" title="Physical form" values={v} required />
        <Field name="saltForm" title="Salt / counter-ion" values={v} required />
        <Field
          name="solubility"
          title="Solubility in laboratory solvents"
          values={v}
          multiline
          hint={`One per line: solvent | concentration | source | note. Accepted solvents: ${LAB_SOLVENTS.join(', ')}. Never a reconstitution volume.`}
        />
        <Field
          name="storageSolid"
          title="Storage (solid)"
          values={v}
          required
        />
        <Field
          name="storageStock"
          title="Storage (stock solution)"
          values={v}
          required
        />
        <Field name="stability" title="Stability" values={v} required />
        <Field name="shipping" title="Shipping condition" values={v} required />
      </section>

      <section className="grid gap-6 lg:grid-cols-2">
        <h2 className="utility-label text-primary lg:col-span-2">Pack sizes</h2>
        <Field
          name="variants"
          title="Pack sizes"
          values={v}
          multiline
          required
          hint={`One per line: quantity | presentation | list price | institutional price | volume prices (all prices in dollars, all optional). Quantity is a mass (5 mg, 1 g). Presentations: ${PRESENTATIONS.join('; ')}. Volume prices are "units:price" separated by commas — 4:52.65, 6:49.14, 10:43.88 — and may carry both tiers as 4:52.65/48.00. Each must be below the price above it; leave the cell empty for one price at any quantity. Prices render only to accounts the visibility rule allows. A line removed here retires that SKU; it is never deleted.`}
        />
        <div className="flex flex-col gap-1.5">
          <label htmlFor="status" className={label}>
            Availability
          </label>
          <select
            id="status"
            name="status"
            key={`k-${v.status || 'enquire'}`} defaultValue={v.status || 'enquire'}
            className={input}
          >
            {Object.entries(STATUS_LABEL).map(([value, text]) => (
              <option key={value} value={value}>
                {text}
              </option>
            ))}
          </select>
        </div>
      </section>

      <section className="grid gap-6">
        <h2 className="utility-label text-primary">Copy and provenance</h2>
        <Field
          name="description"
          title="Description"
          values={v}
          multiline
          required
          hint="What the material is, how identity and purity are determined. Nothing about what it does in an organism."
        />
        <Field
          name="sourceNotes"
          title="Source notes"
          values={v}
          multiline
          required
          hint="One per line. Where each figure came from, and any supplier disagreement shown rather than reconciled."
        />
      </section>

      <section className="grid gap-6">
        <h2 className="utility-label text-primary">GHS hazard classification</h2>
        <p className="max-w-[70ch] text-sm leading-6 text-muted-foreground">
          What a container label states. Leave every field blank and the material is simply
          unclassified — the hazard communication programme reports that rather than hiding it.
          A signal word of <span className="font-mono">none</span> is different: it records a
          finding that the material is not classified as hazardous, and needs a source like any
          other figure.
        </p>
        <div className="grid gap-6 lg:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="hazardSignalWord" className={label}>
              Signal word
            </label>
            <select
              id="hazardSignalWord"
              name="hazardSignalWord"
              key={`k-${v.hazardSignalWord || ''}`}
              defaultValue={v.hazardSignalWord || ''}
              className={input}
            >
              <option value="">Not classified</option>
              <option value="danger">danger</option>
              <option value="warning">warning</option>
              <option value="none">none (not classified as hazardous)</option>
            </select>
          </div>
          <Field
            name="hazardPictograms"
            title="Pictograms"
            values={v}
            hint="GHS codes separated by spaces, e.g. GHS07 GHS08."
          />
        </div>
        <Field
          name="hazardStatements"
          title="Hazard statements"
          values={v}
          multiline
          hint="One per line, code then text: H315 Causes skin irritation."
        />
        <Field
          name="hazardPrecautionary"
          title="Precautionary statements"
          values={v}
          multiline
          hint="One per line: P264 Wash hands thoroughly after handling."
        />
        <Field
          name="hazardClassification"
          title="Hazard class and category"
          values={v}
          multiline
          hint="One per line, e.g. Skin irritation, Category 2."
        />
        <div className="grid gap-6 lg:grid-cols-2">
          <Field
            name="hazardSource"
            title="Source of the classification"
            values={v}
            hint="The SDS or supplier this is taken from. Required when anything above is filled in."
          />
          <Field
            name="hazardDissent"
            title="Supplier disagreement"
            values={v}
            hint="Where a supplier classifies it differently, record theirs here rather than choosing between them."
          />
        </div>
        <div className="grid gap-6 lg:grid-cols-2">
          <Field name="hazardReviewedBy" title="Reviewed by" values={v} />
          <Field
            name="hazardReviewedAt"
            title="Date reviewed"
            values={v}
            hint="YYYY-MM-DD."
          />
        </div>
      </section>

      <section className="grid gap-6 lg:grid-cols-2">
        <h2 className="utility-label text-primary lg:col-span-2">
          Publication
        </h2>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="visibility" className={label}>
            Visibility
          </label>
          <select
            id="visibility"
            name="visibility"
            key={`k-${v.visibility || 'draft'}`} defaultValue={v.visibility || 'draft'}
            className={input}
          >
            {VISIBILITIES.map((x) => (
              <option key={x} value={x}>
                {x}
              </option>
            ))}
          </select>
          <p className={help}>
            Only published products appear on the site. Withdrawn products keep
            their record.
          </p>
        </div>
        <Field
          name="withdrawnReason"
          title="Withdrawal reason"
          values={v}
          hint="Required when withdrawn."
        />
        <input type="hidden" name="image" value={v.image ?? ''} />
        <Field
          name="displayOrder"
          title="Display order"
          values={v}
          hint="Lower numbers appear first on the catalog index and home page."
        />
        <div className="flex flex-col gap-3 pt-7">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              name="hasSds"
              defaultChecked={v.hasSds === 'on'}
            />{' '}
            Safety data sheet available
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              name="featured"
              defaultChecked={v.featured === 'on'}
            />{' '}
            Featured on the home page
          </label>
        </div>
        <Field
          name="note"
          title="Change note"
          values={v}
          hint="Recorded with this revision."
        />
      </section>

      <div className="flex items-center gap-4 border-t border-border pt-6">
        <button
          type="submit"
          disabled={pending}
          className="inline-flex h-12 items-center justify-center bg-primary px-6 text-sm font-bold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
        >
          {pending
            ? 'Saving…'
            : mode === 'create'
              ? 'Create product'
              : 'Save changes'}
        </button>
        <p className={help}>
          Every field is checked against the catalog rules before anything is
          written.
        </p>
      </div>
    </form>
  );
}
