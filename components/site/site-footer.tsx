import { NavLink } from '@/components/site/nav-link';
import { openCheckoutEnabled } from '@/lib/site-config';
import { loadCatalog } from '@/lib/catalog-data';
import { listActiveClasses } from '@/lib/classes';
import { BrandLogo } from '@/components/site/brand-logo';

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
      { href: '/contact', label: 'Contact' },
    ],
  },
  {
    heading: 'Legal',
    links: [
      { href: '/legal/terms', label: 'Terms of sale' },
      { href: '/legal/research-use', label: 'Research-use policy' },
      { href: '/legal/shipping', label: 'Shipping policy' },
      { href: '/legal/returns', label: 'Returns & refunds' },
      { href: '/legal/privacy', label: 'Privacy policy' },
      { href: '/legal/compliance', label: 'Compliance & disclosures' },
    ],
  },
];

export async function SiteFooter() {
  const open = openCheckoutEnabled();
  const classes = (await loadCatalog(listActiveClasses)).data ?? [];
  const columns = [
    {
      heading: 'Catalog',
      links: [
        { href: '/catalog', label: 'All materials' },
        ...classes.map((c) => ({
          href: `/catalog?class=${encodeURIComponent(c.name)}#catalog-search`,
          label: c.name,
        })),
      ],
    },
    ...staticColumns,
  ];
  return (
    <footer className="site-footer px-4 pb-6 pt-10 sm:px-6">
      <div className="mx-auto max-w-[1280px] rounded-[2rem] bg-[var(--ion-navy)] px-6 py-12 text-white sm:px-10 lg:px-12">
        <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-[1.4fr_repeat(4,1fr)]">
          <div className="max-w-sm">
            <BrandLogo />
            <p className="mt-5 text-sm leading-6 text-white/65">
              {open
                ? 'An independent supplier of laboratory research materials in the United States.'
                : 'An independent supplier of research materials for qualified laboratory organizations in the United States.'}{' '}
              Every lot ships with its own analytical documentation.
            </p>
          </div>

          {columns.map((column) => (
            <div key={column.heading}>
              <p className="utility-label text-white/50">
                {column.heading}
              </p>
              <ul className="mt-4 space-y-2.5 text-sm">
                {column.links.map((link) => (
                  <li key={link.label}>
                    <NavLink
                      href={link.href}
                      className="text-white/75 transition-colors hover:text-white"
                    >
                      {open && link.href === '/access'
                        ? 'How to order'
                        : link.label}
                    </NavLink>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-12 border-t border-border pt-8">
          <p className="max-w-4xl text-xs leading-6 text-white/55">
            <strong className="font-semibold text-white">
              Research use only.
            </strong>{' '}
            All materials listed on this site are supplied strictly for in vitro
            laboratory research and analytical use. They are not drugs,
            medicines, dietary supplements, cosmetics, food, or consumer
            products. They are not for human or veterinary use, not for clinical
            or diagnostic procedures, and not for consumption. Nothing on this
            site is medical advice, and no statement here has been evaluated by
            the Food and Drug Administration. Purchasers are solely responsible
            for compliance with all applicable federal, state, and local law and
            for the safe handling, use, and disposal of every material received.
          </p>
          <div className="mt-8 flex flex-col justify-between gap-3 text-xs text-white/45 sm:flex-row sm:items-center">
            <p>
              &copy; {new Date().getFullYear()} 8486 Ventures LLC, trading as
              NexPhase Labs. Oakland, California.
            </p>
            <NavLink
              href="/manage/products"
              className="utility-label transition-colors hover:text-white"
            >
              Catalog manager
            </NavLink>
          </div>
        </div>
      </div>
    </footer>
  );
}
