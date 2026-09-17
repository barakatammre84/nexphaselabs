CREATE TABLE `affiliates` (
	`id` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`code` text NOT NULL,
	`status` text DEFAULT 'applied' NOT NULL,
	`commission_bps` integer DEFAULT 1000 NOT NULL,
	`audience` text,
	`channels` text,
	`applied_at` integer NOT NULL,
	`decided_at` integer,
	`decided_by` text,
	`decision_note` text,
	`agreement_version` text,
	`agreement_accepted_at` integer,
	`tax_form_status` text DEFAULT 'none' NOT NULL,
	`tax_form_received_at` integer,
	`tax_form_reference` text,
	`payout_email` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `affiliates_code_idx` ON `affiliates` (`code`);--> statement-breakpoint
CREATE UNIQUE INDEX `affiliates_account_idx` ON `affiliates` (`account_id`);--> statement-breakpoint
CREATE INDEX `affiliates_status_idx` ON `affiliates` (`status`);--> statement-breakpoint
CREATE TABLE `affiliate_referrals` (
	`id` text PRIMARY KEY NOT NULL,
	`affiliate_id` text NOT NULL,
	`account_id` text NOT NULL,
	`code` text NOT NULL,
	`bound_at` integer NOT NULL,
	`client_address` text,
	`user_agent` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `affiliate_referrals_account_idx` ON `affiliate_referrals` (`account_id`);--> statement-breakpoint
CREATE INDEX `affiliate_referrals_affiliate_idx` ON `affiliate_referrals` (`affiliate_id`);--> statement-breakpoint
CREATE TABLE `affiliate_commissions` (
	`id` text PRIMARY KEY NOT NULL,
	`affiliate_id` text NOT NULL,
	`order_id` text NOT NULL,
	`order_number` text NOT NULL,
	`account_id` text NOT NULL,
	`basis_cents` integer NOT NULL,
	`rate_bps` integer NOT NULL,
	`amount_cents` integer NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`vests_at` integer,
	`vested_at` integer,
	`reversed_at` integer,
	`reversed_reason` text,
	`payout_id` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	CONSTRAINT "affiliate_commissions_amount_check" CHECK("affiliate_commissions"."amount_cents" >= 0 AND "affiliate_commissions"."basis_cents" >= 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `affiliate_commissions_order_idx` ON `affiliate_commissions` (`order_id`);--> statement-breakpoint
CREATE INDEX `affiliate_commissions_affiliate_status_idx` ON `affiliate_commissions` (`affiliate_id`,`status`);--> statement-breakpoint
CREATE INDEX `affiliate_commissions_payout_idx` ON `affiliate_commissions` (`payout_id`);--> statement-breakpoint
CREATE TABLE `affiliate_payouts` (
	`id` text PRIMARY KEY NOT NULL,
	`affiliate_id` text NOT NULL,
	`amount_cents` integer NOT NULL,
	`commission_count` integer NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`method` text DEFAULT 'zelle' NOT NULL,
	`reference` text,
	`note` text,
	`created_by` text NOT NULL,
	`created_at` integer NOT NULL,
	`sent_at` integer,
	`sent_by` text
);
--> statement-breakpoint
CREATE INDEX `affiliate_payouts_affiliate_idx` ON `affiliate_payouts` (`affiliate_id`);--> statement-breakpoint
CREATE INDEX `affiliate_payouts_sent_idx` ON `affiliate_payouts` (`sent_at`);
