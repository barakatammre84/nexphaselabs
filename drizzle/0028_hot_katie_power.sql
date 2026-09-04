CREATE TABLE `document_sequences` (
	`key` text PRIMARY KEY NOT NULL,
	`next_value` integer DEFAULT 1 NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `issued_documents` (
	`id` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`subject_type` text NOT NULL,
	`subject_id` text NOT NULL,
	`document_number` text NOT NULL,
	`object_key` text NOT NULL,
	`content_type` text DEFAULT 'application/pdf' NOT NULL,
	`size_bytes` integer NOT NULL,
	`sha256` text NOT NULL,
	`issued_by` text NOT NULL,
	`issued_at` integer NOT NULL,
	`superseded_by_id` text,
	`superseded_at` integer,
	`supersede_reason` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `issued_documents_subject_idx` ON `issued_documents` (`subject_type`,`subject_id`);--> statement-breakpoint
CREATE INDEX `issued_documents_kind_idx` ON `issued_documents` (`kind`);--> statement-breakpoint
CREATE UNIQUE INDEX `issued_documents_number_idx` ON `issued_documents` (`document_number`);--> statement-breakpoint
CREATE UNIQUE INDEX `issued_documents_key_idx` ON `issued_documents` (`object_key`);