import { AlertCircle } from 'lucide-react';

/** Shown in place of catalog content when the database cannot be reached. */
export function CatalogUnavailable({ compact = false }: { compact?: boolean }) {
  return (
    <div
      role="status"
      className={`flex items-start gap-3 border border-border bg-secondary ${compact ? 'p-5' : 'mx-auto max-w-2xl p-7'}`}
    >
      <AlertCircle className="mt-0.5 size-4 shrink-0 text-primary" />
      <p className="text-sm leading-6">
        The catalog is temporarily unavailable. Try again in a few minutes, or email{' '}
        <a href="mailto:research@nexphaselabs.net" className="font-semibold text-primary">
          research@nexphaselabs.net
        </a>
        .
      </p>
    </div>
  );
}
