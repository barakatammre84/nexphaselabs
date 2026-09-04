'use client';

import { useEffect, useRef, type ReactNode } from 'react';

/** Native disclosure works without hydration; enhance navigation and Escape. */
export function MobileMenu({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    function outside(event: PointerEvent) {
      if (
        event.target instanceof Node &&
        ref.current &&
        !ref.current.contains(event.target)
      )
        ref.current.open = false;
    }
    document.addEventListener('pointerdown', outside);
    return () => document.removeEventListener('pointerdown', outside);
  }, []);
  return (
    <details
      ref={ref}
      className="relative xl:hidden"
      onClick={(event) => {
        if (event.target instanceof Element && event.target.closest('a')) {
          if (ref.current) ref.current.open = false;
        }
      }}
      onKeyDown={(event) => {
        if (event.key === 'Escape' && ref.current) {
          ref.current.open = false;
          ref.current.querySelector('summary')?.focus();
        }
      }}
    >
      <summary className="cursor-pointer rounded-md border border-border px-4 py-3 text-sm font-semibold">
        Menu
      </summary>
      {children}
    </details>
  );
}
