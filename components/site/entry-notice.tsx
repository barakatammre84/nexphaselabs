'use client';

import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { ENTRY_NOTICE, MINIMUM_AGE } from '@/lib/policy';

/**
 * The entry interstitial: age and research-use affirmation before the
 * storefront is used.
 *
 * It is a courtesy notice, not the record of consent - that is taken at
 * account creation and at every checkout, where it is stored against a
 * person. So it keeps nothing about a person: a single first-party cookie
 * remembers that the notice was accepted in this browser, and expires on
 * its own. Staff surfaces are excluded; they are behind their own sign-in.
 */
const COOKIE = 'nx_entry';
const COOKIE_DAYS = 180;
const EXCLUDED_PREFIXES = ['/manage', '/staff', '/api'];

function accepted(): boolean {
  try {
    return document.cookie.split(';').some((part) => part.trim().startsWith(`${COOKIE}=`));
  } catch {
    return true;
  }
}

function remember() {
  try {
    const secure = window.location.protocol === 'https:' ? '; Secure' : '';
    document.cookie = `${COOKIE}=1; Max-Age=${COOKIE_DAYS * 86400}; Path=/; SameSite=Lax${secure}`;
  } catch {
    // A browser that refuses the cookie simply sees the notice again.
  }
}

export function EntryNotice() {
  const pathname = usePathname();
  const [state, setState] = useState<'hidden' | 'open' | 'declined'>('hidden');
  const acceptRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (EXCLUDED_PREFIXES.some((prefix) => pathname?.startsWith(prefix))) return;
    if (accepted()) return;
    setState('open');
  }, [pathname]);

  useEffect(() => {
    if (state === 'hidden') return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    acceptRef.current?.focus();
    return () => {
      document.body.style.overflow = previous;
    };
  }, [state]);

  if (state === 'hidden') return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="entry-notice-title"
      className="fixed inset-0 z-[100] flex items-center justify-center bg-[var(--ion-navy)]/85 px-4 py-8 backdrop-blur-sm"
    >
      <div className="w-full max-w-lg rounded-[1.5rem] bg-background p-6 text-foreground shadow-2xl sm:p-8">
        <p className="utility-label text-primary">Before you enter</p>
        <h2 id="entry-notice-title" className="mt-3 font-display text-2xl font-bold tracking-tight">
          {ENTRY_NOTICE.title}
        </h2>
        {state === 'open' ? (
          <>
            <p className="mt-4 text-sm leading-6 text-muted-foreground">{ENTRY_NOTICE.body}</p>
            <div className="mt-6 flex flex-col gap-3 sm:flex-row">
              <button
                ref={acceptRef}
                type="button"
                onClick={() => {
                  remember();
                  setState('hidden');
                }}
                className="inline-flex h-12 flex-1 items-center justify-center rounded-full bg-primary px-5 text-sm font-extrabold text-primary-foreground hover:bg-primary/90"
              >
                {ENTRY_NOTICE.accept}
              </button>
              <button
                type="button"
                onClick={() => setState('declined')}
                className="inline-flex h-12 items-center justify-center rounded-full border border-border px-5 text-sm font-bold hover:bg-secondary"
              >
                {ENTRY_NOTICE.decline}
              </button>
            </div>
            <p className="mt-4 text-xs leading-5 text-muted-foreground">
              Your answer is kept in this browser only. You will confirm it again, on the record, when you create an
              account and at every checkout.
            </p>
          </>
        ) : (
          <p className="mt-4 text-sm leading-6 text-muted-foreground">
            Thank you. This site supplies research materials to researchers aged {MINIMUM_AGE} and over, and cannot be
            used otherwise. You can close this tab.
          </p>
        )}
      </div>
    </div>
  );
}
