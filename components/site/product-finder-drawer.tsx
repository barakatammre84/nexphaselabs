'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Search, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';

type FinderProduct = { code: string; name: string; slug: string };

export function ProductFinderDrawer({ products }: { products: FinderProduct[] }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return products;
    return products.filter(
      (product) =>
        product.name.toLowerCase().includes(needle) ||
        product.code.toLowerCase().includes(needle),
    );
  }, [products, query]);

  useEffect(() => setOpen(false), [pathname]);
  useEffect(() => {
    if (!open) return;
    const close = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', close);
    return () => window.removeEventListener('keydown', close);
  }, [open]);

  if (pathname.startsWith('/manage') || pathname.startsWith('/staff')) return null;

  return (
    <>
      <button
        type="button"
        className="product-rail"
        aria-label="Open product finder"
        aria-expanded={open}
        onClick={() => setOpen(true)}
      >
        Products
      </button>
      {open && (
        <div className="product-finder-layer" role="presentation" onMouseDown={() => setOpen(false)}>
          <aside
            className="product-finder-drawer"
            role="dialog"
            aria-modal="true"
            aria-label="Product finder"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-5">
              <div>
                <p className="ion-kicker">Product directory</p>
                <h2 className="mt-4 font-display text-3xl font-extrabold tracking-tight text-[var(--ion-navy)]">
                  Find products fast
                </h2>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">
                  Search the NexPhase catalog by name or catalog number.
                </p>
              </div>
              <button type="button" className="header-icon-link shrink-0" aria-label="Close product finder" onClick={() => setOpen(false)}>
                <X className="size-5" />
              </button>
            </div>
            <label className="relative mt-7 block">
              <span className="sr-only">Search product list</span>
              <Search className="absolute left-4 top-1/2 size-5 -translate-y-1/2 text-muted-foreground" />
              <input
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                autoFocus
                placeholder="Search products"
                className="min-h-12 w-full rounded-full border border-input bg-secondary py-3 pl-12 pr-4 outline-none focus:border-primary"
              />
            </label>
            <p className="mt-4 text-xs font-bold text-muted-foreground" role="status">
              {filtered.length} {filtered.length === 1 ? 'product' : 'products'}
            </p>
            <nav className="mt-3" aria-label="Product finder results">
              <ul className="max-h-[52vh] space-y-1 overflow-y-auto pr-2">
                {filtered.map((product) => (
                  <li key={product.code}>
                    <Link href={`/catalog/${product.slug}`} className="flex items-center justify-between gap-4 rounded-xl px-3 py-3 text-sm font-bold text-[var(--ion-navy)] transition-colors hover:bg-secondary hover:text-primary">
                      <span>{product.name}</span>
                      <span className="font-mono text-[10px] text-muted-foreground">{product.code}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
            <Link href="/catalog" className="action-primary mt-6 w-full justify-center">Shop all products</Link>
          </aside>
        </div>
      )}
    </>
  );
}
