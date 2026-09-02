CREATE TABLE `product_revisions` (
	`id` text PRIMARY KEY NOT NULL,
	`product_id` text NOT NULL,
	`product_code` text NOT NULL,
	`action` text NOT NULL,
	`snapshot` text NOT NULL,
	`changed_by` text NOT NULL,
	`changed_by_name` text NOT NULL,
	`note` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `product_revisions_product_idx` ON `product_revisions` (`product_id`);