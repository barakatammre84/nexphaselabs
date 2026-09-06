export function BrandLogo({ compact = false }: { compact?: boolean }) {
  return (
    <span className="brand-logo" aria-hidden="true">
      <span className="brand-logo__mark">
        <img src="/favicon.svg" alt="" width="38" height="38" />
      </span>
      <span className="brand-logo__type">
        <span>NexPhase</span>
        {!compact && <span className="brand-logo__labs">Labs</span>}
      </span>
    </span>
  );
}
