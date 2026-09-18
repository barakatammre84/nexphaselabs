CREATE TABLE `sensitive_report_exports` (
  `id` text PRIMARY KEY NOT NULL,
  `staff_user_id` text NOT NULL REFERENCES `staff_users`(`id`),
  `purpose` text NOT NULL CHECK (`purpose` IN (
    'financial_reconciliation',
    'inventory_custody_review',
    'tax_reporting',
    'legal_compliance',
    'incident_investigation'
  )),
  `report_type` text NOT NULL,
  `filters` text NOT NULL,
  `row_count` integer NOT NULL CHECK (`row_count` >= 0),
  `created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `sensitive_report_exports_staff_created_idx`
  ON `sensitive_report_exports` (`staff_user_id`, `created_at`);
--> statement-breakpoint
CREATE INDEX `sensitive_report_exports_created_idx`
  ON `sensitive_report_exports` (`created_at`);
--> statement-breakpoint
CREATE TABLE `sensitive_report_export_alerts` (
  `id` text PRIMARY KEY NOT NULL,
  `export_id` text NOT NULL REFERENCES `sensitive_report_exports`(`id`) ON DELETE CASCADE,
  `staff_user_id` text NOT NULL REFERENCES `staff_users`(`id`),
  `reason` text NOT NULL,
  `created_at` integer NOT NULL,
  `resolved_at` integer
);
--> statement-breakpoint
CREATE INDEX `sensitive_report_export_alerts_open_created_idx`
  ON `sensitive_report_export_alerts` (`resolved_at`, `created_at`);
--> statement-breakpoint
CREATE UNIQUE INDEX `sensitive_report_export_alerts_export_idx`
  ON `sensitive_report_export_alerts` (`export_id`);