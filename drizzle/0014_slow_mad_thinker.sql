ALTER TABLE `lot_status_events` ADD `kind` text DEFAULT 'disposition' NOT NULL;--> statement-breakpoint
ALTER TABLE `lots` ADD `accession_number` text;--> statement-breakpoint
ALTER TABLE `lots` ADD `analytical_lab` text;--> statement-breakpoint
ALTER TABLE `lots` ADD `net_peptide_content` text;--> statement-breakpoint
ALTER TABLE `lots` ADD `appearance` text;--> statement-breakpoint
ALTER TABLE `lots` ADD `testing_standard` text;--> statement-breakpoint
CREATE INDEX `lots_accession_idx` ON `lots` (`accession_number`);