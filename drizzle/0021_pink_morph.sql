DROP INDEX `lots_lot_number_idx`;--> statement-breakpoint
CREATE UNIQUE INDEX `lots_lot_number_current_idx` ON `lots` (`lot_number`) WHERE superseded_by_id IS NULL;--> statement-breakpoint
CREATE INDEX `lots_lot_number_idx2` ON `lots` (`lot_number`);