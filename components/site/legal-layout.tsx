/**
 * Shared shell for legal pages.
 *
 * The `draft` banner is intentional: these pages are structured templates, not
 * legal advice, and they have not been reviewed by counsel. Remove the banner
 * (set draft={false}) only once a lawyer has signed off on the wording.
 */
export function LegalPage({
  title,
  updated,
  intro,
  draft = true,
  children,
}: {
  title: string;
  updated: string;
  intro: string;
  draft?: boolean;
  children: React.ReactNode;
}) {
  return (
    <main className="text-foreground">
      <section className="mx-auto max-w-[980px] px-4 py-10 sm:px-6 lg:py-14">
        <div className="ion-page-hero p-7 sm:p-10 lg:p-12">
        {draft && (
          <p className="mb-10 rounded-[1.1rem] border border-destructive/40 bg-destructive/5 p-4 text-sm leading-6">
            <strong className="font-semibold">Draft — not yet reviewed by counsel.</strong> This page is a
            structured template prepared for review. It is not legal advice and must be reviewed by a qualified
            attorney before the site goes live.
          </p>
        )}
        <p className="ion-kicker">Policies</p>
        <h1 className="ion-heading mt-6 text-[clamp(2.8rem,5vw,4.7rem)]">
          {title}
        </h1>
        <p className="mt-4 font-mono text-xs text-muted-foreground">Last updated: {updated}</p>
        <p className="mt-7 text-lg leading-8 text-muted-foreground">{intro}</p>
        </div>
        <div className="ion-panel mt-6 space-y-10 p-7 sm:p-10 lg:p-12">{children}</div>
      </section>
    </main>
  );
}

export function LegalSection({ id, heading, children }: { id?: string; heading: string; children: React.ReactNode }) {
  return (
    <section id={id} className="scroll-mt-32 border-t border-border pt-8">
      <h2 className="font-display text-xl font-bold tracking-tight">{heading}</h2>
      <div className="mt-4 space-y-4 leading-7 text-muted-foreground">{children}</div>
    </section>
  );
}
