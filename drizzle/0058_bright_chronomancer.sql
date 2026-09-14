CREATE TABLE `zelle_mailbox_state` (
	`mailbox` text PRIMARY KEY NOT NULL,
	`last_successful_at` integer,
	`last_message_count` integer DEFAULT 0 NOT NULL,
	`last_error` text,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `zelle_payment_claims` (
	`order_id` text PRIMARY KEY NOT NULL,
	`payer_name` text,
	`claimed_by` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`matched_receipt_id` text,
	`claimed_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`order_id`) REFERENCES `orders`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "zelle_payment_claims_status_check" CHECK("zelle_payment_claims"."status" IN ('pending','review','matched','closed'))
);
--> statement-breakpoint
CREATE INDEX `zelle_payment_claims_status_idx` ON `zelle_payment_claims` (`status`,`claimed_at`);--> statement-breakpoint
CREATE TABLE `zelle_receipts` (
	`id` text PRIMARY KEY NOT NULL,
	`source_message_id` text NOT NULL,
	`source_thread_id` text,
	`message_hash` text NOT NULL,
	`sender` text NOT NULL,
	`recipient` text NOT NULL,
	`authentication` text NOT NULL,
	`completion` text NOT NULL,
	`amount_cents` integer,
	`currency` text DEFAULT 'USD' NOT NULL,
	`payer_name` text,
	`memo` text,
	`order_number` text,
	`occurred_at` integer,
	`order_id` text,
	`outcome` text DEFAULT 'received' NOT NULL,
	`outcome_detail` text,
	`parser_version` text NOT NULL,
	`decided_by` text,
	`received_at` integer DEFAULT (unixepoch()) NOT NULL,
	`processed_at` integer,
	FOREIGN KEY (`order_id`) REFERENCES `orders`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "zelle_receipts_authentication_check" CHECK("zelle_receipts"."authentication" IN ('verified','failed','unknown')),
	CONSTRAINT "zelle_receipts_completion_check" CHECK("zelle_receipts"."completion" IN ('received','negative','unknown')),
	CONSTRAINT "zelle_receipts_outcome_check" CHECK("zelle_receipts"."outcome" IN ('received','review','matched','refund_due','rejected','duplicate','ignored')),
	CONSTRAINT "zelle_receipts_amount_check" CHECK("zelle_receipts"."amount_cents" IS NULL OR "zelle_receipts"."amount_cents" > 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `zelle_receipts_message_idx` ON `zelle_receipts` (`source_message_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `zelle_receipts_hash_idx` ON `zelle_receipts` (`message_hash`);--> statement-breakpoint
CREATE INDEX `zelle_receipts_outcome_idx` ON `zelle_receipts` (`outcome`,`received_at`);--> statement-breakpoint
CREATE INDEX `zelle_receipts_order_idx` ON `zelle_receipts` (`order_id`,`received_at`);--> statement-breakpoint
CREATE INDEX `zelle_receipts_number_idx` ON `zelle_receipts` (`order_number`);