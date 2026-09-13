CREATE TABLE `order_contact_verifications` (
	`id` text PRIMARY KEY NOT NULL,
	`order_id` text NOT NULL,
	`email` text NOT NULL,
	`token_hash` text NOT NULL,
	`expires_at` integer NOT NULL,
	`verified_at` integer,
	`sent_count` integer DEFAULT 1 NOT NULL,
	`last_sent_at` integer,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `order_contact_verifications_order_idx` ON `order_contact_verifications` (`order_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `order_contact_verifications_token_idx` ON `order_contact_verifications` (`token_hash`);--> statement-breakpoint
ALTER TABLE `orders` ADD `contact_verified_at` integer;