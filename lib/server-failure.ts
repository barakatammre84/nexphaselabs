/**
 * React development builds mirror server console output into the Flight stream.
 * Keep render-time failure logs to fixed event names so database/ORM error text
 * can never become part of an HTML or RSC response.
 */
export type ServerFailure =
  | 'catalog-read'
  | 'viewer-account-lookup'
  | 'header-account-lookup'
  | 'newsletter-confirm';

const messages: Record<ServerFailure, string> = {
  'catalog-read': '[catalog] read failed',
  'viewer-account-lookup': '[viewer] account lookup failed',
  'header-account-lookup': '[header] account lookup failed',
  'newsletter-confirm': '[newsletter] confirm failed',
};

export function reportServerFailure(failure: ServerFailure): void {
  console.error(messages[failure]);
}
