CREATE TABLE `zelle_reconciliation_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`business_date` text NOT NULL,
	`chase_received_cents` integer NOT NULL,
	`chase_refunded_cents` integer DEFAULT 0 NOT NULL,
	`matched_cents` integer NOT NULL,
	`matched_count` integer NOT NULL,
	`exception_count` integer NOT NULL,
	`difference_cents` integer NOT NULL,
	`actor` text NOT NULL,
	`note` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	CONSTRAINT "zelle_reconciliation_received_check" CHECK("zelle_reconciliation_runs"."chase_received_cents" >= 0),
	CONSTRAINT "zelle_reconciliation_refunded_check" CHECK("zelle_reconciliation_runs"."chase_refunded_cents" >= 0),
	CONSTRAINT "zelle_reconciliation_matched_check" CHECK("zelle_reconciliation_runs"."matched_cents" >= 0),
	CONSTRAINT "zelle_reconciliation_count_check" CHECK("zelle_reconciliation_runs"."matched_count" >= 0 AND "zelle_reconciliation_runs"."exception_count" >= 0)
);
--> statement-breakpoint
CREATE INDEX `zelle_reconciliation_date_idx` ON `zelle_reconciliation_runs` (`business_date`,`created_at`);