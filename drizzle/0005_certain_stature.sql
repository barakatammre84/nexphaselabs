CREATE TABLE `lot_status_events` (
	`id` text PRIMARY KEY NOT NULL,
	`lot_id` text NOT NULL,
	`from_status` text NOT NULL,
	`to_status` text NOT NULL,
	`reason` text,
	`decided_by` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `lot_status_events_lot_idx` ON `lot_status_events` (`lot_id`);