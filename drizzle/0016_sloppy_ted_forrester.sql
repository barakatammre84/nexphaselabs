CREATE TABLE `chemical_class_revisions` (
	`id` text PRIMARY KEY NOT NULL,
	`class_id` text NOT NULL,
	`action` text NOT NULL,
	`snapshot` text NOT NULL,
	`changed_by` text NOT NULL,
	`note` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `chemical_class_revisions_class_idx` ON `chemical_class_revisions` (`class_id`);--> statement-breakpoint
CREATE TABLE `chemical_classes` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`blurb` text DEFAULT '' NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_by` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `chemical_classes_name_unique` ON `chemical_classes` (`name`);