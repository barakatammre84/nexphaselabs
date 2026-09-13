ALTER TABLE `orders` ADD `assigned_to` text;--> statement-breakpoint
ALTER TABLE `orders` ADD `assigned_name` text;--> statement-breakpoint
ALTER TABLE `orders` ADD `service_due_at` integer;--> statement-breakpoint
CREATE INDEX `orders_assigned_idx` ON `orders` (`assigned_to`);--> statement-breakpoint
CREATE INDEX `orders_service_due_idx` ON `orders` (`service_due_at`);