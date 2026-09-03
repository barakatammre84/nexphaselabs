import Link from 'next/link';
import { loadCatalog } from '@/lib/catalog-data';
import { listActiveClasses } from '@/lib/classes';

const staticColumns = [
  {
    heading: 'Standards',
    links: [
      { href: '/documentation', label: 'Documentation & QC' },
      { href: '/documentation#coa', label: 'What a COA includes' },
      { href: '/documentation#handling', label: 'Storage & handling' },
      { href: '/documentation/lot-lookup', label: 'Lot lookup' },
      { href: '/documentation/sds', label: 'Safety data sheets' },
      { href: '/faq', label: 'FAQ' },
    ],
  },
  {
    heading: 'Company',
    links: [
      { href: '/about', label: 'About NexPhase Labs' },
      { href: '/access', label: 'Research access' },
      { href: 'mailto:research@nexphaselabs.net', label: 'Contact' },
    ],
  },
  {
    heading: 'Legal',
    links: [
      { href: '/legal/terms', label: 'Terms of sale' },
      { href: '/legal/shipping', label: 'Shipping policy' },
      { href: '/legal/returns', label: 'Returns policy' },
      { href: '/legal/privacy', label: 'Privacy policy' },
      { href: '/legal/terms#research-use', label: 'Research-use policy' },
    ],
  },
];

export async function SiteFooter() {
  const classes = (await loadCatalog(listActiveClasses)).data ?? [];
  const columns = [
    {
      heading: 'Catalog',
      links: [
        { href: '/catalog', label: 'All materials' },
        ...classes.map((c) => ({ href: `/catalog#${c.id}`, label: c.name })),
      ],
    },
    ...staticColumns,
  ];
  return (
    <footer className="border-t border-border bg-secondary">
      <div className="mx-auto max-w-[1500px] px-5 py-14 sm:px-8 lg:px-12">
        <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-[1.4fr_repeat(4,1fr)]">
          <div className="max-w-sm">
            <div className="flex items-center gap-3">
              <span className="grid size-9 place-items-center bg-primary text-sm font-extrabold text-primary-foreground">
                NX
              </span>
              <span className="font-display text-[15px] font-extrabold uppercase tracking-[0.16em]">
                NexPhase <span className="text-primary">Labs</span>
              </span>
            </div>
            <p className="mt-5 text-sm leading-6 text-muted-foreground">
              An independent supplier of research materials for qualified
              laboratory organizations in the United States. Every lot ships
              with its own analytical documentation.
            </p>
          </div>

          {columns.map((column) => (
            <div key={column.heading}>
              <p className="utility-label text-muted-foreground">
                {column.heading}
              </p>
              <ul className="mt-4 space-y-2.5 text-sm">
                {column.links.map((link) => (
                  <li key={link.label}>
                    <Link
                      href={link.href}
                      className="transition-colors hover:text-primary"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-12 border-t border-border pt-8">
          <p className="max-w-4xl text-xs leading-6 text-muted-foreground">
            <strong className="font-semibold text-foreground">
              Research use only.
            </strong>{' '}
            All materials listed on this site are supplied strictly for in vitro
            laboratory research and analytical use by qualified organizations.
            They are not drugs, medicines, dietary supplements, cosmetics, food,
            or consumer products. They are not for human or veterinary use, not
            for clinical or diagnostic procedures, and not for consumption.
            Nothing on this site is medical advice, and no statement here has
            been evaluated by the Food and Drug Administration. Purchasers are
            solely responsible for compliance with all applicable federal,
            state, and local law and for the safe handling, use, and disposal of
            every material received.
          </p>
          <div className="mt-8 flex flex-col justify-between gap-3 text-xs text-muted-foreground sm:flex-row sm:items-center">
            <p>
              &copy; {new Date().getFullYear()} 8486 Ventures LLC, trading as
              NexPhase Labs. Oakland, California.
            </p>
            <Link
              href="/manage/products"
              className="utility-label transition-colors hover:text-primary"
            >
              Catalog manager
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
