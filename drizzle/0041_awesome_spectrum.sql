CREATE TABLE `operational_control_events` (
	`id` text PRIMARY KEY NOT NULL,
	`control_key` text NOT NULL,
	`from_status` text NOT NULL,
	`to_status` text NOT NULL,
	`owner_id` text,
	`owner_name` text,
	`due_on` integer,
	`evidence_url` text,
	`note` text,
	`actor` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `operational_control_events_control_idx` ON `operational_control_events` (`control_key`,`created_at`);--> statement-breakpoint
CREATE TABLE `operational_controls` (
	`key` text PRIMARY KEY NOT NULL,
	`status` text DEFAULT 'not_started' NOT NULL CHECK (`status` IN ('not_started','in_progress','blocked','awaiting_review','ready','not_applicable')),
	`owner_id` text,
	`owner_name` text,
	`due_on` integer,
	`evidence_url` text,
	`note` text,
	`last_change_id` text,
	`updated_by` text NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `operational_controls_status_idx` ON `operational_controls` (`status`);--> statement-breakpoint
CREATE INDEX `operational_controls_owner_idx` ON `operational_controls` (`owner_id`);--> statement-breakpoint
CREATE INDEX `operational_controls_due_idx` ON `operational_controls` (`due_on`);
