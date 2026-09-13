CREATE TABLE `account_addresses` (
	`id` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`label` text,
	`consignee_name` text NOT NULL,
	`consignee_institution` text,
	`line1` text NOT NULL,
	`line2` text,
	`city` text NOT NULL,
	`region` text NOT NULL,
	`postal_code` text NOT NULL,
	`country` text DEFAULT 'US' NOT NULL,
	`phone` text,
	`is_default` integer DEFAULT false NOT NULL,
	`last_used_at` integer,
	`archived_at` integer,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `account_addresses_account_idx` ON `account_addresses` (`account_id`,`archived_at`);