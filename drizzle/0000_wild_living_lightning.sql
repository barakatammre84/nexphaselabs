CREATE TABLE `lot_movements` (
	`id` text PRIMARY KEY NOT NULL,
	`lot_id` text NOT NULL,
	`movement_type` text NOT NULL,
	`quantity` text NOT NULL,
	`account_id` text,
	`consignee_name` text,
	`consignee_institution` text,
	`ship_to_address` text,
	`carrier` text,
	`tracking_number` text,
	`witness_one` text,
	`witness_two` text,
	`occurred_at` integer NOT NULL,
	`recorded_by` text NOT NULL,
	`note` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `lot_movements_lot_idx` ON `lot_movements` (`lot_id`);--> statement-breakpoint
CREATE INDEX `lot_movements_account_idx` ON `lot_movements` (`account_id`);--> statement-breakpoint
CREATE INDEX `lot_movements_occurred_idx` ON `lot_movements` (`occurred_at`);--> statement-breakpoint
CREATE TABLE `lot_tests` (
	`id` text PRIMARY KEY NOT NULL,
	`lot_id` text NOT NULL,
	`test_type` text NOT NULL,
	`analyte` text,
	`method` text NOT NULL,
	`result` text NOT NULL,
	`specification` text,
	`passed` integer,
	`tested_by` text,
	`tested_at` integer,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `lot_tests_lot_idx` ON `lot_tests` (`lot_id`);--> statement-breakpoint
CREATE TABLE `lots` (
	`id` text PRIMARY KEY NOT NULL,
	`lot_number` text NOT NULL,
	`product_code` text NOT NULL,
	`product_name` text NOT NULL,
	`cas_number` text NOT NULL,
	`manufacturer_name` text,
	`manufacturer_address` text,
	`supplier_name` text,
	`country_of_origin` text,
	`entry_number` text,
	`manufacture_date` integer,
	`received_at` integer NOT NULL,
	`purity_result` text,
	`purity_method` text,
	`identity_confirmed` integer DEFAULT false NOT NULL,
	`identity_method` text,
	`water_content` text,
	`heavy_metals_summary` text,
	`coa_key` text,
	`chromatogram_key` text,
	`mass_spec_key` text,
	`sds_key` text,
	`status` text DEFAULT 'quarantine' NOT NULL,
	`released_by` text,
	`released_at` integer,
	`status_reason` text,
	`quantity_received` text,
	`quantity_remaining` text,
	`storage_location` text,
	`storage_condition` text,
	`retest_date` integer,
	`superseded_by_id` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `lots_lot_number_idx` ON `lots` (`lot_number`);--> statement-breakpoint
CREATE INDEX `lots_product_idx` ON `lots` (`product_code`);--> statement-breakpoint
CREATE INDEX `lots_status_idx` ON `lots` (`status`);