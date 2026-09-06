ALTER TABLE `notifications` ADD `category` text DEFAULT 'order' NOT NULL;--> statement-breakpoint
ALTER TABLE `notifications` ADD `action_path` text;