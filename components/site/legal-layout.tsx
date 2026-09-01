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
    <main className="bg-background text-foreground">
      <section className="mx-auto max-w-[900px] px-5 py-14 sm:px-8 lg:py-20">
        {draft && (
          <p className="mb-10 border border-destructive/40 bg-destructive/5 p-4 text-sm leading-6">
            <strong className="font-semibold">Draft — not yet reviewed by counsel.</strong> This page is a
            structured template prepared for review. It is not legal advice and must be reviewed by a qualified
            attorney before the site goes live.
          </p>
        )}
        <p className="utility-label text-primary">Legal</p>
        <h1 className="mt-5 font-display text-[clamp(2.2rem,4.2vw,3.6rem)] font-extrabold leading-[0.95] tracking-[-0.05em]">
          {title}
        </h1>
        <p className="mt-4 font-mono text-xs text-muted-foreground">Last updated: {updated}</p>
        <p className="mt-7 text-lg leading-8 text-muted-foreground">{intro}</p>
        <div className="mt-12 space-y-10">{children}</div>
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
