-- Promo codes (owner, 16 September 2026). A coupon is a record staff create;
-- a redemption is written with the order that used it, so every discount on
-- an order has a code, a person who created that code, and a count.
CREATE TABLE `coupons` (
	`id` text PRIMARY KEY NOT NULL,
	`code` text NOT NULL,
	`kind` text NOT NULL,
	`value` integer NOT NULL,
	`min_subtotal_cents` integer,
	`starts_at` integer,
	`ends_at` integer,
	`max_redemptions` integer,
	`redemption_count` integer DEFAULT 0 NOT NULL,
	`per_account_limit` integer,
	`active` integer DEFAULT 1 NOT NULL,
	`note` text,
	`created_by` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `coupons_code_idx` ON `coupons` (`code`);
--> statement-breakpoint
CREATE TABLE `coupon_redemptions` (
	`id` text PRIMARY KEY NOT NULL,
	`coupon_id` text NOT NULL,
	`order_id` text NOT NULL,
	`account_id` text NOT NULL,
	`code` text NOT NULL,
	`discount_cents` integer NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `coupon_redemptions_order_idx` ON `coupon_redemptions` (`order_id`);
--> statement-breakpoint
CREATE INDEX `coupon_redemptions_coupon_account_idx` ON `coupon_redemptions` (`coupon_id`,`account_id`);
--> statement-breakpoint
ALTER TABLE `checkout_quotes` ADD `coupon_code` text;
--> statement-breakpoint
ALTER TABLE `checkout_quotes` ADD `discount_cents` integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE `orders` ADD `coupon_code` text;
--> statement-breakpoint
ALTER TABLE `orders` ADD `discount_cents` integer DEFAULT 0 NOT NULL;
