CREATE TABLE `shipping_tracking_events` (
	`id` text PRIMARY KEY NOT NULL,
	`provider_event_key` text NOT NULL,
	`event_name` text NOT NULL,
	`carrier` text NOT NULL,
	`tracking_number` text NOT NULL,
	`provider_status_id` text,
	`provider_transaction_id` text,
	`status` text NOT NULL,
	`status_detail` text,
	`status_at` integer,
	`test` integer DEFAULT false NOT NULL,
	`verified` integer DEFAULT false NOT NULL,
	`order_id` text,
	`outcome` text DEFAULT 'received' NOT NULL,
	`outcome_detail` text,
	`received_at` integer DEFAULT (unixepoch()) NOT NULL,
	`processed_at` integer,
	FOREIGN KEY (`order_id`) REFERENCES `orders`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "shipping_tracking_events_outcome_check" CHECK("shipping_tracking_events"."outcome" IN ('received','verification_retry','recorded','delivered','unmatched','ignored','attention'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `shipping_tracking_events_key_idx` ON `shipping_tracking_events` (`provider_event_key`);--> statement-breakpoint
CREATE INDEX `shipping_tracking_events_tracking_idx` ON `shipping_tracking_events` (`tracking_number`);--> statement-breakpoint
CREATE INDEX `shipping_tracking_events_order_idx` ON `shipping_tracking_events` (`order_id`);--> statement-breakpoint
CREATE INDEX `shipping_tracking_events_outcome_idx` ON `shipping_tracking_events` (`outcome`,`received_at`);