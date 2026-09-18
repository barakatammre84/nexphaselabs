ALTER TABLE `lots` ADD `assigned_to` text;
--> statement-breakpoint
ALTER TABLE `lots` ADD `assigned_name` text;
--> statement-breakpoint
ALTER TABLE `lots` ADD `service_due_at` integer;
--> statement-breakpoint
ALTER TABLE `lots` ADD `last_assignment_id` text;
--> statement-breakpoint
CREATE INDEX `lots_assigned_idx` ON `lots` (`assigned_to`);
--> statement-breakpoint
CREATE INDEX `lots_service_due_idx` ON `lots` (`service_due_at`);
--> statement-breakpoint
CREATE TABLE `lot_assignment_events` (
  `id` text PRIMARY KEY NOT NULL,
  `lot_id` text NOT NULL,
  `from_owner_id` text,
  `from_owner` text,
  `to_owner_id` text,
  `to_owner` text,
  `from_service_due_at` integer,
  `to_service_due_at` integer,
  `assigned_by` text NOT NULL,
  `created_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `lot_assignment_events_lot_idx` ON `lot_assignment_events` (`lot_id`);
--> statement-breakpoint
ALTER TABLE `organizations` ADD `assigned_to` text;
--> statement-breakpoint
ALTER TABLE `organizations` ADD `assigned_name` text;
--> statement-breakpoint
ALTER TABLE `organizations` ADD `service_due_at` integer;
--> statement-breakpoint
ALTER TABLE `organizations` ADD `last_assignment_id` text;
--> statement-breakpoint
CREATE INDEX `organizations_assigned_idx` ON `organizations` (`assigned_to`);
--> statement-breakpoint
CREATE INDEX `organizations_service_due_idx` ON `organizations` (`service_due_at`);
--> statement-breakpoint
CREATE TABLE `verification_assignment_events` (
  `id` text PRIMARY KEY NOT NULL,
  `organization_id` text NOT NULL,
  `from_owner_id` text,
  `from_owner` text,
  `to_owner_id` text,
  `to_owner` text,
  `from_service_due_at` integer,
  `to_service_due_at` integer,
  `assigned_by` text NOT NULL,
  `created_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `verification_assignment_events_org_idx` ON `verification_assignment_events` (`organization_id`);