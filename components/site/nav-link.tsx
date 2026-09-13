import Link from 'next/link';
import type { ComponentProps } from 'react';

/**
 * A link in the site chrome — header, mobile menu, footer.
 *
 * Next prefetches a `<Link>` as it scrolls into view, and each prefetch of an
 * app route is a full server render. The chrome appears on every page, so a cold
 * homepage load fired eleven RSC renders before the visitor had touched
 * anything, competing with the render they were actually waiting for (16.1).
 *
 * Chrome navigation is not where perceived speed comes from, so these do not
 * prefetch. Links in the body of a page still do: those are the ones a visitor
 * is about to follow. Pass `prefetch` explicitly to override.
 */
export function NavLink(props: ComponentProps<typeof Link>) {
  return <Link prefetch={false} {...props} />;
}
