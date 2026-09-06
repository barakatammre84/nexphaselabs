DROP INDEX `feedback_conversations_token_idx`;--> statement-breakpoint
CREATE INDEX `feedback_conversations_token_idx` ON `feedback_conversations` (`visitor_token_hash`);--> statement-breakpoint
ALTER TABLE `feedback_conversations` ADD `priority` text DEFAULT 'normal' NOT NULL CHECK (`priority` IN ('urgent','high','normal','low'));--> statement-breakpoint
ALTER TABLE `feedback_conversations` ADD `labels` text DEFAULT '[]' NOT NULL;--> statement-breakpoint
ALTER TABLE `feedback_conversations` ADD `resolution_summary` text;--> statement-breakpoint
ALTER TABLE `feedback_conversations` ADD `issue_url` text;--> statement-breakpoint
ALTER TABLE `feedback_messages` ADD `screenshot_key` text;--> statement-breakpoint
ALTER TABLE `feedback_messages` ADD `screenshot_mime` text;--> statement-breakpoint
ALTER TABLE `feedback_messages` ADD `screenshot_size` integer;--> statement-breakpoint
CREATE TABLE `feedback_notes` (
	`id` text PRIMARY KEY NOT NULL,
	`conversation_id` text NOT NULL,
	`staff_id` text NOT NULL,
	`staff_name` text NOT NULL,
	`body` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`conversation_id`) REFERENCES `feedback_conversations`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "feedback_notes_body_check" CHECK(length("feedback_notes"."body") BETWEEN 1 AND 2000)
);--> statement-breakpoint
CREATE INDEX `feedback_notes_conversation_idx` ON `feedback_notes` (`conversation_id`,`created_at`);
