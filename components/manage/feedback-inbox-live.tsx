'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

/** The queue is cross-conversation, so use a quiet bounded refresh rather than one global socket bottleneck. */
export function FeedbackInboxLive() {
  const router = useRouter();
  useEffect(() => {
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') router.refresh();
    }, 10_000);
    return () => window.clearInterval(timer);
  }, [router]);
  return null;
}
