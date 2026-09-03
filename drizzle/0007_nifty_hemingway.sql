CREATE TABLE `account_acknowledgements` (
	`id` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`document` text NOT NULL,
	`version` text NOT NULL,
	`accepted_at` integer NOT NULL,
	`user_agent` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `account_acknowledgements_account_idx` ON `account_acknowledgements` (`account_id`);