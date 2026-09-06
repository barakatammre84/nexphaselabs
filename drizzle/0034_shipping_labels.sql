CREATE TABLE `fulfillment_quotes` (
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
	CONSTRAINT "fulfillment_quotes_carrier_check" CHECK("fulfillment_quotes"."carrier" IN ('UPS','FedEx')),
	CONSTRAINT "fulfillment_quotes_amount_check" CHECK("fulfillment_quotes"."amount_cents" > 0)
);
--> statement-breakpoint
CREATE INDEX `fulfillment_quotes_order_idx` ON `fulfillment_quotes` (`order_id`);--> statement-breakpoint
CREATE TABLE `shipping_labels` (
	`order_id` text PRIMARY KEY NOT NULL,
	`id` text NOT NULL,
	`quote_id` text NOT NULL,
	`state` text NOT NULL,
	`provider_ref` text,
	`label_url` text,
	`tracking_number` text,
	`carrier` text NOT NULL,
	`service_name` text NOT NULL,
	`amount_cents` integer NOT NULL,
	`test` integer DEFAULT false NOT NULL,
	`error` text,
	`created_by` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`order_id`) REFERENCES `orders`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`quote_id`) REFERENCES `fulfillment_quotes`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "shipping_labels_state_check" CHECK("shipping_labels"."state" IN ('requesting','ready','attention','voided')),
	CONSTRAINT "shipping_labels_amount_check" CHECK("shipping_labels"."amount_cents" > 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `shipping_labels_id_idx` ON `shipping_labels` (`id`);