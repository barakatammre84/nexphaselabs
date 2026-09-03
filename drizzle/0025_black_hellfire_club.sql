CREATE TABLE `purchase_order_events` (
	`id` text PRIMARY KEY NOT NULL,
	`purchase_order_id` text NOT NULL,
	`from_status` text NOT NULL,
	`to_status` text NOT NULL,
	`note` text,
	`actor` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `purchase_order_events_po_idx` ON `purchase_order_events` (`purchase_order_id`);--> statement-breakpoint
CREATE TABLE `purchase_order_lines` (
	`id` text PRIMARY KEY NOT NULL,
	`purchase_order_id` text NOT NULL,
	`line_no` integer NOT NULL,
	`product_code` text NOT NULL,
	`product_name` text NOT NULL,
	`quantity` text NOT NULL,
	`line_cost_cents` integer NOT NULL,
	`received_quantity` text,
	`received_count` integer DEFAULT 0 NOT NULL,
	`closed_at` integer,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `purchase_order_lines_po_idx` ON `purchase_order_lines` (`purchase_order_id`);--> statement-breakpoint
CREATE INDEX `purchase_order_lines_product_idx` ON `purchase_order_lines` (`product_code`);--> statement-breakpoint
CREATE TABLE `purchase_orders` (
	`id` text PRIMARY KEY NOT NULL,
	`po_number` text NOT NULL,
	`supplier_id` text NOT NULL,
	`supplier_name` text NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`ordered_on` integer,
	`expected_on` integer,
	`freight_cents` integer DEFAULT 0 NOT NULL,
	`duty_cents` integer DEFAULT 0 NOT NULL,
	`supplier_reference` text,
	`note` text,
	`last_transition_id` text,
	`created_by` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `purchase_orders_number_idx` ON `purchase_orders` (`po_number`);--> statement-breakpoint
CREATE INDEX `purchase_orders_supplier_idx` ON `purchase_orders` (`supplier_id`);--> statement-breakpoint
CREATE INDEX `purchase_orders_status_idx` ON `purchase_orders` (`status`);--> statement-breakpoint
CREATE TABLE `supplier_events` (
	`id` text PRIMARY KEY NOT NULL,
	`supplier_id` text NOT NULL,
	`action` text NOT NULL,
	`detail` text,
	`actor` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `supplier_events_supplier_idx` ON `supplier_events` (`supplier_id`);--> statement-breakpoint
CREATE TABLE `suppliers` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`address` text,
	`country` text,
	`contact_name` text,
	`contact_email` text,
	`phone` text,
	`website` text,
	`notes` text,
	`qualification_status` text DEFAULT 'unqualified' NOT NULL,
	`qualified_by` text,
	`qualified_at` integer,
	`active` integer DEFAULT true NOT NULL,
	`last_change_id` text,
	`created_by` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `suppliers_name_idx` ON `suppliers` (`name`);--> statement-breakpoint
ALTER TABLE `lots` ADD `purchase_order_line_id` text;