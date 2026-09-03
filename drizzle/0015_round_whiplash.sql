CREATE TABLE `product_documents` (
	`id` text PRIMARY KEY NOT NULL,
	`product_id` text NOT NULL,
	`kind` text NOT NULL,
	`object_key` text NOT NULL,
	`content_type` text NOT NULL,
	`size_bytes` integer NOT NULL,
	`original_name` text,
	`revision` text,
	`uploaded_by` text NOT NULL,
	`uploaded_at` integer NOT NULL,
	`superseded_at` integer,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `product_documents_product_idx` ON `product_documents` (`product_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `product_documents_key_idx` ON `product_documents` (`object_key`);