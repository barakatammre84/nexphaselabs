import { NOTICE_COOKIE, readNotice } from '@/lib/notice';

/** The refusal a route left in its notice cookie, as the next page would read it. */
export function noticeFrom(response: Response): string | null {
  const entry = response.headers
    .getSetCookie()
    .find((cookie) => cookie.startsWith(`${NOTICE_COOKIE}=`));
  return entry ? readNotice(entry.slice(NOTICE_COOKIE.length + 1).split(';')[0]) : null;
}
