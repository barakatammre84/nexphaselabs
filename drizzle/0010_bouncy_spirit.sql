CREATE TABLE `cart_items` (
	`id` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`variant_id` text NOT NULL,
	`quantity` integer DEFAULT 1 NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `cart_items_account_variant_idx` ON `cart_items` (`account_id`,`variant_id`);--> statement-breakpoint
CREATE TABLE `order_events` (
	`id` text PRIMARY KEY NOT NULL,
	`order_id` text NOT NULL,
	`from_status` text NOT NULL,
	`to_status` text NOT NULL,
	`note` text,
	`actor` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `order_events_order_idx` ON `order_events` (`order_id`);--> statement-breakpoint
CREATE TABLE `order_items` (
	`id` text PRIMARY KEY NOT NULL,
	`order_id` text NOT NULL,
	`product_id` text NOT NULL,
	`product_code` text NOT NULL,
	`product_name` text NOT NULL,
	`variant_id` text NOT NULL,
	`sku` text NOT NULL,
	`pack_size` text NOT NULL,
	`presentation` text NOT NULL,
	`quantity` integer NOT NULL,
	`unit_price_cents` integer NOT NULL,
	`line_total_cents` integer NOT NULL,
	`lot_id` text,
	`lot_number` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `order_items_order_idx` ON `order_items` (`order_id`);--> statement-breakpoint
CREATE TABLE `orders` (
	`id` text PRIMARY KEY NOT NULL,
	`order_number` text NOT NULL,
	`account_id` text NOT NULL,
	`organization_id` text,
	`channel` text DEFAULT 'research_direct' NOT NULL,
	`authorization_ref` text,
	`status` text DEFAULT 'submitted' NOT NULL,
	`currency` text DEFAULT 'USD' NOT NULL,
	`subtotal_cents` integer NOT NULL,
	`shipping_cents` integer DEFAULT 0 NOT NULL,
	`total_cents` integer NOT NULL,
	`price_tier` text NOT NULL,
	`consignee_name` text NOT NULL,
	`consignee_institution` text,
	`ship_to_line1` text NOT NULL,
	`ship_to_line2` text,
	`ship_to_city` text NOT NULL,
	`ship_to_region` text NOT NULL,
	`ship_to_postal_code` text NOT NULL,
	`ship_to_country` text NOT NULL,
	`ship_to_phone` text,
	`payment_method` text,
	`payment_ref` text,
	`payment_status` text DEFAULT 'unpaid' NOT NULL,
	`carrier` text,
	`tracking_number` text,
	`customer_note` text,
	`submitted_at` integer NOT NULL,
	`paid_at` integer,
	`shipped_at` integer,
	`cancelled_at` integer,
	`cancel_reason` text,
	`last_transition_id` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `orders_number_idx` ON `orders` (`order_number`);--> statement-breakpoint
CREATE INDEX `orders_account_idx` ON `orders` (`account_id`);--> statement-breakpoint
CREATE INDEX `orders_status_idx` ON `orders` (`status`);