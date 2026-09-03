CREATE TABLE `lot_documents` (
	`id` text PRIMARY KEY NOT NULL,
	`lot_id` text NOT NULL,
	`document_type` text NOT NULL,
	`object_key` text NOT NULL,
	`content_type` text NOT NULL,
	`size_bytes` integer NOT NULL,
	`original_name` text,
	`uploaded_by` text NOT NULL,
	`uploaded_at` integer NOT NULL,
	`superseded_at` integer,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `lot_documents_lot_idx` ON `lot_documents` (`lot_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `lot_documents_key_idx` ON `lot_documents` (`object_key`);