ALTER TABLE `orders` ADD `submission_token` text;--> statement-breakpoint
CREATE UNIQUE INDEX `orders_submission_token_idx` ON `orders` (`submission_token`);