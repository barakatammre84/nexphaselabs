-- Owner decision of 16 September 2026: customers manage their own account
-- details from the dashboard. A changed email address is written here first and
-- becomes the account's address only when the new mailbox answers its
-- confirmation link (lib/account-auth.ts verifyEmailToken), so a typo can never
-- lock a customer out of the account they are signed in to.
ALTER TABLE `accounts` ADD `pending_email` text;
