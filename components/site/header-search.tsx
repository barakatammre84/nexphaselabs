'use client';

import { Search, X } from 'lucide-react';
import { useEffect, useState } from 'react';

export function HeaderSearch() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const close = (event: KeyboardEvent) => event.key === 'Escape' && setOpen(false);
    window.addEventListener('keydown', close);
    return () => window.removeEventListener('keydown', close);
  }, [open]);

  return (
    <div className="relative">
      <button type="button" className="header-icon-link" aria-label="Search catalog" aria-expanded={open} onClick={() => setOpen((value) => !value)}>
        {open ? <X className="size-5" /> : <Search className="size-5" />}
      </button>
      {open && (
        <form action="/catalog" method="get" role="search" className="absolute right-0 top-[calc(100%+0.75rem)] flex w-[min(32rem,calc(100vw-2rem))] gap-2 rounded-[1.25rem] border border-border bg-white p-3 shadow-[0_24px_60px_rgba(22,28,95,0.2)]">
          <label className="sr-only" htmlFor="header-catalog-search">Search catalog</label>
          <input id="header-catalog-search" name="q" type="search" autoFocus maxLength={120} placeholder="Product, catalog number, or CAS" className="min-h-11 min-w-0 flex-1 rounded-full border border-input bg-secondary px-4 text-sm outline-none focus:border-primary" />
          <button type="submit" className="action-primary px-5">Search</button>
        </form>
      )}
    </div>
  );
}
