PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_shipping_labels` (
	`id` text PRIMARY KEY NOT NULL,
	`order_id` text NOT NULL,
	`quote_id` text NOT NULL,
	`state` text NOT NULL,
	`origin_id` text DEFAULT 'primary' NOT NULL,
	`origin_label` text DEFAULT 'Primary location' NOT NULL,
	`provider_ref` text,
	`label_url` text,
	`tracking_number` text,
	`carrier` text NOT NULL,
	`service_name` text NOT NULL,
	`amount_cents` integer NOT NULL,
	`test` integer DEFAULT false NOT NULL,
	`error` text,
	`refund_state` text,
	`refund_ref` text,
	`refund_reason` text,
	`refund_requested_by` text,
	`refund_requested_at` integer,
	`refund_updated_at` integer,
	`created_by` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`order_id`) REFERENCES `orders`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`quote_id`) REFERENCES `fulfillment_quotes`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "shipping_labels_state_check" CHECK("__new_shipping_labels"."state" IN ('requesting','ready','voiding','attention','voided')),
	CONSTRAINT "shipping_labels_refund_state_check" CHECK("__new_shipping_labels"."refund_state" IS NULL OR "__new_shipping_labels"."refund_state" IN ('requesting','pending','success','attention')),
	CONSTRAINT "shipping_labels_amount_check" CHECK("__new_shipping_labels"."amount_cents" > 0)
);
--> statement-breakpoint
INSERT INTO `__new_shipping_labels`("id", "order_id", "quote_id", "state", "provider_ref", "label_url", "tracking_number", "carrier", "service_name", "amount_cents", "test", "error", "created_by", "created_at", "updated_at") SELECT "id", "order_id", "quote_id", "state", "provider_ref", "label_url", "tracking_number", "carrier", "service_name", "amount_cents", "test", "error", "created_by", "created_at", "updated_at" FROM `shipping_labels`;--> statement-breakpoint
DROP TABLE `shipping_labels`;--> statement-breakpoint
ALTER TABLE `__new_shipping_labels` RENAME TO `shipping_labels`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `shipping_labels_order_idx` ON `shipping_labels` (`order_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `shipping_labels_active_order_idx` ON `shipping_labels` (`order_id`) WHERE "shipping_labels"."state" <> 'voided';--> statement-breakpoint
ALTER TABLE `checkout_quotes` ADD `origin_id` text DEFAULT 'primary' NOT NULL;--> statement-breakpoint
ALTER TABLE `checkout_quotes` ADD `origin_label` text DEFAULT 'Primary location' NOT NULL;--> statement-breakpoint
ALTER TABLE `fulfillment_quotes` ADD `origin_id` text DEFAULT 'primary' NOT NULL;--> statement-breakpoint
ALTER TABLE `fulfillment_quotes` ADD `origin_label` text DEFAULT 'Primary location' NOT NULL;
