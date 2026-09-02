CREATE TABLE `product_variants` (
	`id` text PRIMARY KEY NOT NULL,
	`product_id` text NOT NULL,
	`sku` text NOT NULL,
	`quantity` text NOT NULL,
	`presentation` text NOT NULL,
	`list_price_cents` integer,
	`institutional_price_cents` integer,
	`active` integer DEFAULT true NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `product_variants_sku_idx` ON `product_variants` (`sku`);--> statement-breakpoint
CREATE INDEX `product_variants_product_idx` ON `product_variants` (`product_id`);--> statement-breakpoint
CREATE TABLE `products` (
	`id` text PRIMARY KEY NOT NULL,
	`code` text NOT NULL,
	`slug` text NOT NULL,
	`name` text NOT NULL,
	`formal_name` text NOT NULL,
	`synonyms` text DEFAULT '[]' NOT NULL,
	`chemical_class` text NOT NULL,
	`cas_number` text NOT NULL,
	`related_cas` text DEFAULT '[]' NOT NULL,
	`sequence_one_letter` text,
	`sequence_three_letter` text,
	`molecular_formula` text NOT NULL,
	`molecular_weight` text NOT NULL,
	`exact_mass` text,
	`smiles` text,
	`inchi_key` text,
	`pubchem_cid` text,
	`purity` text NOT NULL,
	`form` text NOT NULL,
	`salt_form` text NOT NULL,
	`solubility` text DEFAULT '[]' NOT NULL,
	`storage_solid` text NOT NULL,
	`storage_stock` text NOT NULL,
	`stability` text NOT NULL,
	`shipping` text NOT NULL,
	`status` text DEFAULT 'enquire' NOT NULL,
	`description` text NOT NULL,
	`source_notes` text DEFAULT '[]' NOT NULL,
	`has_sds` integer DEFAULT false NOT NULL,
	`image` text,
	`featured` integer DEFAULT false NOT NULL,
	`visibility` text DEFAULT 'draft' NOT NULL,
	`withdrawn_reason` text,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_by` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `products_code_idx` ON `products` (`code`);--> statement-breakpoint
CREATE UNIQUE INDEX `products_slug_idx` ON `products` (`slug`);--> statement-breakpoint
CREATE INDEX `products_class_idx` ON `products` (`chemical_class`);--> statement-breakpoint
CREATE INDEX `products_visibility_idx` ON `products` (`visibility`);