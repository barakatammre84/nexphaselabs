CREATE TABLE `stock_waitlist` (
	`id` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`product_code` text NOT NULL,
	`sku` text NOT NULL,
	`status` text DEFAULT 'waiting' NOT NULL,
	`notify_count` integer DEFAULT 0 NOT NULL,
	`notified_at` integer,
	`last_notification_id` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `stock_waitlist_account_sku_idx` ON `stock_waitlist` (`account_id`,`sku`);--> statement-breakpoint
CREATE INDEX `stock_waitlist_product_status_idx` ON `stock_waitlist` (`product_code`,`status`);
