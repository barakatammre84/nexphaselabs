'use client';

import { useMemo, useState } from 'react';
import { ChevronDown, Search } from 'lucide-react';

export type FaqSection = {
  heading: string;
  items: { q: string; a: string }[];
};

export function FaqExplorer({ sections }: { sections: FaqSection[] }) {
  const [query, setQuery] = useState('');
  const [active, setActive] = useState('All questions');
  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    const terms = normalized === 'coa'
      ? ['coa', 'certificate of analysis', 'batch documentation']
      : normalized === 'sds'
        ? ['sds', 'safety data sheet']
        : [normalized];
    return sections
      .filter((section) => active === 'All questions' || section.heading === active)
      .map((section) => ({
        ...section,
        items: section.items.filter(
          (item) =>
            !normalized || terms.some((term) =>
              item.q.toLowerCase().includes(term) ||
              item.a.toLowerCase().includes(term),
            ),
        ),
      }))
      .filter((section) => section.items.length > 0);
  }, [active, query, sections]);
  const resultCount = filtered.reduce((count, section) => count + section.items.length, 0);

  return (
    <div>
      <div className="ion-panel p-5 sm:p-7">
        <label htmlFor="faq-search" className="font-display text-sm font-extrabold text-[var(--ion-navy)]">
          Search questions
        </label>
        <div className="relative mt-3">
          <Search className="absolute left-4 top-1/2 size-5 -translate-y-1/2 text-muted-foreground" />
          <input
            id="faq-search"
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search products, COAs, shipping, orders, or payments"
            className="min-h-13 w-full rounded-full border border-input bg-secondary py-3 pl-12 pr-5 text-sm outline-none focus:border-primary"
          />
        </div>
        <div className="mt-5 flex flex-wrap gap-2" aria-label="FAQ categories">
          {['All questions', ...sections.map((section) => section.heading)].map((label) => (
            <button
              key={label}
              type="button"
              onClick={() => setActive(label)}
              className={`rounded-full px-4 py-2 text-sm font-bold transition-colors ${
                active === label
                  ? 'bg-primary text-white'
                  : 'border border-border bg-white text-muted-foreground hover:border-primary hover:text-primary'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        <p className="mt-4 text-sm text-muted-foreground" role="status">
          {resultCount} {resultCount === 1 ? 'answer' : 'answers'} available
        </p>
      </div>

      {filtered.length === 0 ? (
        <div className="ion-panel mt-6 p-8 text-center">
          <h2 className="font-display text-xl font-extrabold text-[var(--ion-navy)]">No matching answers</h2>
          <p className="mt-3 text-sm text-muted-foreground">Try a shorter search, or contact our support team.</p>
        </div>
      ) : (
        <div className="mt-10 space-y-12">
          {filtered.map((section) => (
            <section key={section.heading}>
              <div className="mb-5 flex items-center justify-between gap-4">
                <h2 className="ion-heading text-3xl">{section.heading}</h2>
                <span className="rounded-full bg-white px-3 py-2 text-xs font-bold text-muted-foreground shadow-sm">
                  {section.items.length}
                </span>
              </div>
              <div className="ion-panel divide-y divide-border">
                {section.items.map((item, index) => (
                  <details key={item.q} className="group px-6 py-1 sm:px-8" open={index === 0 && !query}>
                    <summary className="flex cursor-pointer list-none items-center justify-between gap-6 py-5 font-display text-base font-extrabold text-[var(--ion-navy)] marker:content-none sm:text-lg">
                      {item.q}
                      <ChevronDown className="size-5 shrink-0 text-primary transition-transform group-open:rotate-180" />
                    </summary>
                    <p className="max-w-3xl pb-6 text-sm leading-7 text-muted-foreground sm:text-base">{item.a}</p>
                  </details>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
