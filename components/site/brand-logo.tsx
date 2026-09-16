/**
 * The NexPhase Labs logo. The artwork lives in public/brand/ as vector files
 * redrawn from the approved logo: "NexP" and the left half of the "h" are
 * Aqua Blue (#56CFFC); the rest is Dark Navy (#0E123B), or white on dark
 * surfaces. Use the files as they are — never retype the name in a web font.
 */
export function BrandLogo({
  compact = false,
  tone = 'light',
}: {
  /** Monogram only, for tight spaces. */
  compact?: boolean;
  /** 'light' on pale surfaces (header), 'dark' on navy surfaces (footer). */
  tone?: 'light' | 'dark';
}) {
  if (compact) {
    return (
      <span className="brand-logo brand-logo--compact" aria-hidden="true">
        <img src="/favicon.svg" alt="" width="38" height="38" />
      </span>
    );
  }
  const src =
    tone === 'dark'
      ? '/brand/nexphase-labs-logo-reversed.svg'
      : '/brand/nexphase-labs-logo.svg';
  return (
    <span className="brand-logo" aria-hidden="true">
      <img
        className="brand-logo__wordmark"
        src={src}
        alt=""
        width="1732"
        height="140"
      />
    </span>
  );
}
