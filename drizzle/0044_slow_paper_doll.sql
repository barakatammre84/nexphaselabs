CREATE TABLE `operational_case_events` (
	`id` text PRIMARY KEY NOT NULL,
	`case_id` text NOT NULL,
	`from_status` text,
	`to_status` text NOT NULL,
	`owner_id` text NOT NULL,
	`owner_name` text NOT NULL,
	`action` text NOT NULL,
	`note` text,
	`actor` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `operational_case_events_case_idx` ON `operational_case_events` (`case_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `operational_cases` (
	`id` text PRIMARY KEY NOT NULL,
	`case_number` text NOT NULL,
	`type` text NOT NULL,
	`severity` text NOT NULL,
	`status` text DEFAULT 'open' NOT NULL,
	`title` text NOT NULL,
	`summary` text NOT NULL,
	`owner_id` text NOT NULL,
	`owner_name` text NOT NULL,
	`due_on` integer NOT NULL,
	`linked_lot_number` text,
	`linked_order_number` text,
	`linked_supplier_id` text,
	`containment` text,
	`root_cause` text,
	`corrective_action` text,
	`preventive_action` text,
	`evidence_url` text,
	`effectiveness_check` text,
	`closure_summary` text,
	`created_by` text NOT NULL,
	`last_change_id` text NOT NULL,
	`closed_at` integer,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `operational_cases_number_idx` ON `operational_cases` (`case_number`);--> statement-breakpoint
CREATE INDEX `operational_cases_status_idx` ON `operational_cases` (`status`);--> statement-breakpoint
CREATE INDEX `operational_cases_owner_idx` ON `operational_cases` (`owner_id`);--> statement-breakpoint
CREATE INDEX `operational_cases_due_idx` ON `operational_cases` (`due_on`);--> statement-breakpoint
CREATE INDEX `operational_cases_lot_idx` ON `operational_cases` (`linked_lot_number`);--> statement-breakpoint
CREATE INDEX `operational_cases_order_idx` ON `operational_cases` (`linked_order_number`);