import Link from 'next/link';

const navigation = [
  { href: '/catalog', label: 'Catalog' },
  { href: '/documentation', label: 'Documentation & QC' },
  { href: '/about', label: 'About' },
  { href: '/faq', label: 'FAQ' },
];

export function SiteHeader() {
  return (
    <>
      <div className="assay-rule" aria-hidden="true" />
      <header className="sticky top-0 z-40 border-b border-border bg-background/92 backdrop-blur">
        <div className="mx-auto flex h-20 max-w-[1500px] items-center justify-between gap-6 px-5 sm:px-8 lg:px-12">
          <Link href="/" className="group flex shrink-0 items-center gap-3" aria-label="NexPhase Labs home">
            <span className="grid size-9 place-items-center bg-primary text-sm font-extrabold text-primary-foreground transition-transform group-hover:-rotate-3">
              NX
            </span>
            <span className="font-display text-[15px] font-extrabold uppercase tracking-[0.16em]">
              NexPhase <span className="text-primary">Labs</span>
            </span>
          </Link>

          <nav className="hidden items-center gap-8 text-sm font-semibold md:flex" aria-label="Primary navigation">
            {navigation.map((item) => (
              <Link key={item.href} href={item.href} className="transition-colors hover:text-primary">
                {item.label}
              </Link>
            ))}
          </nav>

          <Link
            href="/access"
            className="hidden h-11 shrink-0 items-center justify-center bg-primary px-5 text-sm font-bold text-primary-foreground transition-colors hover:bg-primary/90 md:inline-flex"
          >
            Request research access
          </Link>
        </div>

        <div className="flex items-center gap-4 border-t border-border px-5 py-3 md:hidden">
          <nav
            className="flex min-w-0 flex-1 items-center gap-5 overflow-x-auto text-sm font-semibold"
            aria-label="Primary navigation"
          >
            {navigation.map((item) => (
              <Link key={item.href} href={item.href} className="whitespace-nowrap transition-colors hover:text-primary">
                {item.label}
              </Link>
            ))}
          </nav>
          <Link
            href="/access"
            className="shrink-0 whitespace-nowrap bg-primary px-3 py-1.5 text-sm font-bold text-primary-foreground"
          >
            Request access
          </Link>
        </div>
      </header>
    </>
  );
}
