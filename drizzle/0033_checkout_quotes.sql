CREATE TABLE `checkout_quotes` (
	`id` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`cart_fingerprint` text NOT NULL,
	`address_fingerprint` text NOT NULL,
	`provider` text NOT NULL,
	`shipment_id` text NOT NULL,
	`rate_id` text NOT NULL,
	`carrier` text NOT NULL,
	`service` text NOT NULL,
	`service_name` text NOT NULL,
	`shipping_cents` integer NOT NULL,
	`tax_cents` integer NOT NULL,
	`currency` text DEFAULT 'USD' NOT NULL,
	`estimated_days` integer,
	`test` integer DEFAULT false NOT NULL,
	`expires_at` integer NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "checkout_quotes_carrier_check" CHECK("checkout_quotes"."carrier" IN ('UPS','FedEx')),
	CONSTRAINT "checkout_quotes_amount_check" CHECK("checkout_quotes"."shipping_cents" > 0 AND "checkout_quotes"."tax_cents" >= 0)
);
--> statement-breakpoint
CREATE INDEX `checkout_quotes_account_idx` ON `checkout_quotes` (`account_id`);--> statement-breakpoint
CREATE INDEX `checkout_quotes_expiry_idx` ON `checkout_quotes` (`expires_at`);--> statement-breakpoint
ALTER TABLE `orders` ADD `tax_cents` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `orders` ADD `shipping_quote_id` text;--> statement-breakpoint
ALTER TABLE `orders` ADD `shipping_rate_id` text;--> statement-breakpoint
ALTER TABLE `orders` ADD `shipping_service` text;