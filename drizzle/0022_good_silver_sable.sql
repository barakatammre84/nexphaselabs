ALTER TABLE `orders` ADD `refund_cents` integer;--> statement-breakpoint
ALTER TABLE `orders` ADD `refund_ref` text;--> statement-breakpoint
ALTER TABLE `orders` ADD `refunded_at` integer;--> statement-breakpoint
ALTER TABLE `orders` ADD `returned_at` integer;