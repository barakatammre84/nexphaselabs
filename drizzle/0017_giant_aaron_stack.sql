CREATE TABLE `staff_events` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`action` text NOT NULL,
	`detail` text,
	`actor` text NOT NULL,
	`user_agent` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `staff_events_user_idx` ON `staff_events` (`user_id`);--> statement-breakpoint
ALTER TABLE `staff_users` ADD `must_change_password` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `staff_users` ADD `password_changed_at` integer;--> statement-breakpoint
ALTER TABLE `staff_users` ADD `created_by` text;