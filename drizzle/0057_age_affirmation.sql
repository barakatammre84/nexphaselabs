ALTER TABLE `accounts` ADD `age_confirmed_at` integer;--> statement-breakpoint
ALTER TABLE `orders` ADD `age_confirmed` integer DEFAULT false NOT NULL;