import type { Metadata } from 'next';
import Link from 'next/link';
import { AlertCircle, ArrowLeft, CircleCheck, Download, FileText } from 'lucide-react';
import { GHS_PICTOGRAMS, PICTOGRAM_CODES } from '@/lib/hazard';
import { previewHazcom } from '@/lib/hazcom';
import { documentHistory } from '@/lib/issued-documents';
import {
  SETTING_KEYS,
  SETTING_LABEL,
  availablePictograms,
  readSettings,
} from '@/lib/settings';
import { canManageStaff, requireStaff } from '@/lib/staff-auth';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = {
  title: 'Hazard communication',
  robots: { index: false, follow: false },
};

const ERROR: Record<string, string> = {
  badform: 'The form could not be read.',
  settings: 'The settings could not be saved. Try again shortly.',
  nofile: 'Choose a PNG file to upload.',
  size: 'The file is larger than 2 MB.',
  notpng: 'Pictogram artwork must be a PNG.',
  pictogram: 'The artwork could not be stored. Try again shortly.',
  issue: 'The programme could not be issued. Nothing was recorded.',
  intent: 'That action is not recognised.',
};

/** Long-form settings get a textarea; the rest a single line. */
const MULTILINE = new Set<string>([
  SETTING_KEYS.registeredAddress,
  SETTING_KEYS.hazcomWorkplace,
  SETTING_KEYS.hazcomSdsAccess,
  SETTING_KEYS.hazcomTraining,
  SETTING_KEYS.hazcomNonRoutine,
]);

type Props = {
  searchParams: Promise<{
    saved?: string;
    issued?: string;
    pictogram?: string;
    error?: string;
  }>;
};

export default async function HazcomPage({ searchParams }: Props) {
  const { saved, issued, pictogram, error } = await searchParams;
  const staff = await requireStaff('/manage/hazcom');
  const admin = canManageStaff(staff);

  const [settings, artwork, preview, history] = await Promise.all([
    readSettings(),
    availablePictograms().catch(() => [] as string[]),
    previewHazcom(),
    documentHistory('facility', 'FACILITY'),
  ]);
  const programmes = history.filter((d) => d.kind === 'hazcom');

  return (
    <main className="bg-background text-foreground">
      <section className="mx-auto max-w-[1000px] px-5 py-12 sm:px-8 lg:px-12">
        <Link
          href="/manage"
          className="inline-flex items-center gap-2 text-sm font-semibold text-muted-foreground hover:text-primary"
        >
          <ArrowLeft className="size-4" /> Operations
        </Link>

        {saved && (
          <p role="status" className="mt-6 flex items-center gap-2 border border-border bg-secondary p-4 text-sm">
            <CircleCheck className="size-4 text-primary" /> Saved.
          </p>
        )}
        {pictogram && (
          <p role="status" className="mt-6 flex items-center gap-2 border border-border bg-secondary p-4 text-sm">
            <CircleCheck className="size-4 text-primary" /> {pictogram} artwork stored.
          </p>
        )}
        {issued && (
          <p role="status" className="mt-6 flex items-center gap-2 border border-border bg-secondary p-4 text-sm">
            <CircleCheck className="size-4 text-primary" /> Programme {issued} issued.
          </p>
        )}
        {error && (
          <p role="alert" className="mt-6 flex items-center gap-2 border border-destructive/40 bg-secondary p-4 text-sm">
            <AlertCircle className="size-4 text-destructive" /> {ERROR[error] ?? error}
          </p>
        )}

        <h1 className="mt-6 font-display text-4xl font-extrabold tracking-[-0.05em]">
          Hazard communication
        </h1>
        <p className="mt-3 max-w-[70ch] text-sm leading-6 text-muted-foreground">
          The written programme required by 29 CFR 1910.1200(e), and the facts every container
          label has to carry. Due 20 November 2026.
        </p>

        {preview.content.outstanding.length > 0 && (
          <div className="mt-8 border border-destructive/40 bg-secondary p-5">
            <p className="text-sm font-semibold">Outstanding</p>
            <ul className="mt-3 space-y-1.5 text-sm">
              {preview.content.outstanding.map((item) => (
                <li key={item} className="flex gap-2">
                  <AlertCircle className="mt-0.5 size-3.5 shrink-0 text-destructive" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
            <p className="mt-4 text-xs leading-5 text-muted-foreground">
              The programme can still be issued. These items are printed on its first page rather
              than hidden, so an issued programme is never mistaken for a complete one.
            </p>
          </div>
        )}

        <h2 className="mt-12 utility-label text-primary">Recorded facts</h2>
        <form
          method="post"
          action="/api/manage/hazcom"
          className="mt-4 flex flex-col gap-5 border border-border bg-secondary p-6"
        >
          <input type="hidden" name="intent" value="settings" />
          {Object.values(SETTING_KEYS).map((key) => (
            <label key={key} className="flex flex-col gap-1.5 text-sm">
              {SETTING_LABEL[key]}
              {MULTILINE.has(key) ? (
                <textarea
                  name={key}
                  rows={3}
                  defaultValue={settings[key] ?? ''}
                  disabled={!admin}
                  className="border border-foreground/20 bg-background px-3 py-2 text-sm disabled:opacity-60"
                />
              ) : (
                <input
                  name={key}
                  defaultValue={settings[key] ?? ''}
                  disabled={!admin}
                  className="h-11 border border-foreground/20 bg-background px-3 text-sm disabled:opacity-60"
                />
              )}
            </label>
          ))}
          {admin && (
            <button
              type="submit"
              className="inline-flex h-11 w-fit items-center justify-center bg-primary px-5 text-sm font-bold text-primary-foreground hover:bg-primary/90"
            >
              Save
            </button>
          )}
        </form>

        <h2 className="mt-12 utility-label text-primary">Pictogram artwork</h2>
        <p className="mt-3 max-w-[70ch] text-sm leading-6 text-muted-foreground">
          The UN pictograms are prescribed artwork, not something to approximate. A label is
          refused for any code whose artwork has not been supplied. Upload the official PNG for
          each code the catalog uses.
        </p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {PICTOGRAM_CODES.map((code) => {
            const present = artwork.includes(code);
            return (
              <div key={code} className="border border-border p-4">
                <p className="text-sm font-semibold">
                  {code}{' '}
                  <span className="font-normal text-muted-foreground">
                    {GHS_PICTOGRAMS[code]}
                  </span>
                </p>
                <p className={`mt-1 text-xs ${present ? 'text-muted-foreground' : 'text-destructive'}`}>
                  {present ? 'Artwork on file' : 'No artwork'}
                </p>
                {admin && (
                  <form
                    method="post"
                    action="/api/manage/hazcom"
                    encType="multipart/form-data"
                    className="mt-3 flex flex-col gap-2"
                  >
                    <input type="hidden" name="intent" value="pictogram" />
                    <input type="hidden" name="code" value={code} />
                    <input
                      name="file"
                      type="file"
                      required
                      accept="image/png"
                      className="text-xs"
                    />
                    <button
                      type="submit"
                      className="inline-flex h-9 w-fit items-center border border-foreground/20 px-3 text-xs font-bold hover:bg-secondary"
                    >
                      {present ? 'Replace' : 'Upload'}
                    </button>
                  </form>
                )}
              </div>
            );
          })}
        </div>

        <h2 className="mt-12 utility-label text-primary">Written programme</h2>
        <div className="mt-4 border border-border bg-secondary p-6">
          {programmes.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No programme has been issued yet.
            </p>
          ) : (
            <ul className="space-y-3">
              {programmes.map((doc) => (
                <li key={doc.id} className="text-sm">
                  <span className="font-semibold">{doc.documentNumber}</span>
                  {doc.supersededById && (
                    <span className="ml-2 text-xs text-muted-foreground">superseded</span>
                  )}
                  <a
                    href={`/api/manage/documents/${doc.id}`}
                    className="ml-3 inline-flex items-center gap-1.5 font-semibold text-primary"
                  >
                    <Download className="size-3.5" /> Download
                  </a>
                  <span className="mt-1 block font-mono text-[11px] text-muted-foreground">
                    {doc.issuedAt.toISOString().slice(0, 10)} &middot; {doc.issuedBy}
                  </span>
                </li>
              ))}
            </ul>
          )}

          <div className="mt-5 flex flex-wrap items-end gap-3">
            <a
              href="/api/manage/hazcom"
              target="_blank"
              rel="noreferrer"
              className="inline-flex h-11 items-center justify-center gap-2 border border-foreground/20 px-5 text-sm font-bold hover:bg-background"
            >
              <FileText className="size-4" /> Preview
            </a>
            {admin && (
              <form method="post" action="/api/manage/hazcom" className="flex flex-wrap items-end gap-3">
                <input type="hidden" name="intent" value="issue" />
                {programmes.length > 0 && (
                  <label className="flex flex-col gap-1.5 text-sm">
                    Reason for reissue
                    <input
                      name="reason"
                      required
                      maxLength={200}
                      placeholder="What changed"
                      className="h-11 w-64 border border-foreground/20 bg-background px-3 text-sm"
                    />
                  </label>
                )}
                <button
                  type="submit"
                  className="inline-flex h-11 items-center justify-center bg-primary px-5 text-sm font-bold text-primary-foreground hover:bg-primary/90"
                >
                  {programmes.length === 0 ? `Issue ${preview.documentNumber}` : 'Reissue'}
                </button>
              </form>
            )}
          </div>
          <p className="mt-4 text-xs leading-5 text-muted-foreground">
            The programme is a snapshot of the inventory and the arrangements as they stand. It is
            reissued rather than edited, so what the programme said on any past date stays on file.
          </p>
        </div>
      </section>
    </main>
  );
}
