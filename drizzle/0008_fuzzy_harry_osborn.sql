CREATE TABLE `organization_documents` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`kind` text NOT NULL,
	`object_key` text NOT NULL,
	`content_type` text NOT NULL,
	`size_bytes` integer NOT NULL,
	`original_name` text,
	`uploaded_at` integer NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `organization_documents_org_idx` ON `organization_documents` (`organization_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `organization_documents_key_idx` ON `organization_documents` (`object_key`);--> statement-breakpoint
CREATE TABLE `organizations` (
	`id` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`legal_name` text NOT NULL,
	`website` text NOT NULL,
	`email_domain` text NOT NULL,
	`organization_type` text NOT NULL,
	`address_line1` text NOT NULL,
	`address_line2` text,
	`city` text NOT NULL,
	`region` text NOT NULL,
	`postal_code` text NOT NULL,
	`country` text NOT NULL,
	`phone` text,
	`registration_number` text,
	`research_context` text NOT NULL,
	`receiving_party` text NOT NULL,
	`review_flags` text DEFAULT '[]' NOT NULL,
	`verification_status` text DEFAULT 'submitted' NOT NULL,
	`submitted_at` integer NOT NULL,
	`reviewed_by` text,
	`reviewed_at` integer,
	`review_note` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `organizations_account_idx` ON `organizations` (`account_id`);--> statement-breakpoint
CREATE INDEX `organizations_status_idx` ON `organizations` (`verification_status`);--> statement-breakpoint
CREATE TABLE `verification_events` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`from_status` text NOT NULL,
	`to_status` text NOT NULL,
	`note` text,
	`decided_by` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `verification_events_org_idx` ON `verification_events` (`organization_id`);