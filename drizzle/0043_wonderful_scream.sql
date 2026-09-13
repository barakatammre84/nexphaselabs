PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_checkout_quotes` (
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
	CONSTRAINT "checkout_quotes_carrier_check" CHECK("__new_checkout_quotes"."carrier" IN ('USPS','UPS','FedEx')),
	CONSTRAINT "checkout_quotes_amount_check" CHECK("__new_checkout_quotes"."shipping_cents" > 0 AND "__new_checkout_quotes"."tax_cents" >= 0)
);
--> statement-breakpoint
INSERT INTO `__new_checkout_quotes`("id", "account_id", "cart_fingerprint", "address_fingerprint", "provider", "shipment_id", "rate_id", "carrier", "service", "service_name", "shipping_cents", "tax_cents", "currency", "estimated_days", "test", "expires_at", "created_at") SELECT "id", "account_id", "cart_fingerprint", "address_fingerprint", "provider", "shipment_id", "rate_id", "carrier", "service", "service_name", "shipping_cents", "tax_cents", "currency", "estimated_days", "test", "expires_at", "created_at" FROM `checkout_quotes`;--> statement-breakpoint
DROP TABLE `checkout_quotes`;--> statement-breakpoint
ALTER TABLE `__new_checkout_quotes` RENAME TO `checkout_quotes`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `checkout_quotes_account_idx` ON `checkout_quotes` (`account_id`);--> statement-breakpoint
CREATE INDEX `checkout_quotes_expiry_idx` ON `checkout_quotes` (`expires_at`);--> statement-breakpoint
CREATE TABLE `__new_fulfillment_quotes` (
	`id` text PRIMARY KEY NOT NULL,
	`order_id` text NOT NULL,
	`provider` text NOT NULL,
	`shipment_id` text NOT NULL,
	`rate_id` text NOT NULL,
	`carrier` text NOT NULL,
	`service` text NOT NULL,
	`service_name` text NOT NULL,
	`amount_cents` integer NOT NULL,
	`currency` text DEFAULT 'USD' NOT NULL,
	`estimated_days` integer,
	`test` integer DEFAULT false NOT NULL,
	`expires_at` integer NOT NULL,
	`created_by` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`order_id`) REFERENCES `orders`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "fulfillment_quotes_carrier_check" CHECK("__new_fulfillment_quotes"."carrier" IN ('USPS','UPS','FedEx')),
	CONSTRAINT "fulfillment_quotes_amount_check" CHECK("__new_fulfillment_quotes"."amount_cents" > 0)
);
--> statement-breakpoint
INSERT INTO `__new_fulfillment_quotes`("id", "order_id", "provider", "shipment_id", "rate_id", "carrier", "service", "service_name", "amount_cents", "currency", "estimated_days", "test", "expires_at", "created_by", "created_at") SELECT "id", "order_id", "provider", "shipment_id", "rate_id", "carrier", "service", "service_name", "amount_cents", "currency", "estimated_days", "test", "expires_at", "created_by", "created_at" FROM `fulfillment_quotes`;--> statement-breakpoint
DROP TABLE `fulfillment_quotes`;--> statement-breakpoint
ALTER TABLE `__new_fulfillment_quotes` RENAME TO `fulfillment_quotes`;--> statement-breakpoint
CREATE INDEX `fulfillment_quotes_order_idx` ON `fulfillment_quotes` (`order_id`);