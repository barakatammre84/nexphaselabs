import { getAccount, type AccountPrincipal } from '@/lib/account-auth';
import { acknowledgementsCurrent } from '@/lib/account-rules';
import {
  accountRequired,
  researcherTierEnabled,
  openCheckoutEnabled,
} from '@/lib/site-config';
import { visibilityFor, type Visibility } from '@/lib/visibility-rules';
import { reportServerFailure } from '@/lib/server-failure';

export type Viewer = {
  account: AccountPrincipal | null;
  visibility: Visibility;
};

/** Resolve the current visitor and what they may see. Never throws; a DB fault reads as anonymous. */
export async function currentViewer(): Promise<Viewer> {
  let account: AccountPrincipal | null = null;
  try {
    account = await getAccount();
  } catch {
    reportServerFailure('viewer-account-lookup');
  }
  const visibility = visibilityFor(
    account
      ? {
          tier: account.tier,
          verificationStatus: account.verificationStatus,
          acknowledgementsCurrent: acknowledgementsCurrent(account),
        }
      : null,
    researcherTierEnabled(),
    openCheckoutEnabled(),
    accountRequired(),
  );
  return { account, visibility };
}
