ALTER TABLE `accounts` ADD `google_subject` text;--> statement-breakpoint
ALTER TABLE `accounts` ADD `google_linked_at` integer;--> statement-breakpoint
CREATE UNIQUE INDEX `accounts_google_subject_idx` ON `accounts` (`google_subject`);
