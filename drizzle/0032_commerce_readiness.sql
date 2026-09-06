CREATE TABLE `guest_order_keys` (
	`order_id` text PRIMARY KEY NOT NULL,
	`token_hash` text NOT NULL,
	`expires_at` integer NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`order_id`) REFERENCES `orders`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `guest_order_sessions` (
	`token_hash` text PRIMARY KEY NOT NULL,
	`order_id` text NOT NULL,
	`expires_at` integer NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`order_id`) REFERENCES `orders`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `guest_order_sessions_order_idx` ON `guest_order_sessions` (`order_id`);--> statement-breakpoint
CREATE TABLE `inventory_reservations` (
	`item_id` text PRIMARY KEY NOT NULL,
	`order_id` text NOT NULL,
	`lot_id` text NOT NULL,
	`units` integer NOT NULL,
	`unit` text NOT NULL,
	`expires_at` integer NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`item_id`) REFERENCES `order_items`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`order_id`) REFERENCES `orders`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`lot_id`) REFERENCES `lots`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "inventory_reservations_units_check" CHECK("inventory_reservations"."units" > 0)
);
--> statement-breakpoint
CREATE INDEX `inventory_reservations_lot_idx` ON `inventory_reservations` (`lot_id`);--> statement-breakpoint
CREATE INDEX `inventory_reservations_order_idx` ON `inventory_reservations` (`order_id`);--> statement-breakpoint
CREATE TABLE `payment_attempts` (
	`order_id` text PRIMARY KEY NOT NULL,
	`id` text NOT NULL,
	`method` text NOT NULL,
	`state` text NOT NULL,
	`reference` text,
	`amount_cents` integer NOT NULL,
	`currency` text NOT NULL,
	`actor` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`order_id`) REFERENCES `orders`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "payment_attempts_state_check" CHECK("payment_attempts"."state" IN ('requesting','ready','attached','attention')),
	CONSTRAINT "payment_attempts_amount_check" CHECK("payment_attempts"."amount_cents" >= 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `payment_attempts_id_idx` ON `payment_attempts` (`id`);