CREATE TABLE `feedback_conversations` (
	`id` text PRIMARY KEY NOT NULL,
	`public_id` text NOT NULL,
	`visitor_token_hash` text NOT NULL,
	`visitor_name` text,
	`visitor_email` text,
	`subject` text,
	`status` text DEFAULT 'new' NOT NULL,
	`source_path` text NOT NULL,
	`assigned_to` text,
	`unread_for_staff` integer DEFAULT 0 NOT NULL,
	`unread_for_visitor` integer DEFAULT 0 NOT NULL,
	`last_sender` text DEFAULT 'visitor' NOT NULL,
	`last_message_at` integer DEFAULT (unixepoch()) NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	CONSTRAINT "feedback_conversations_status_check" CHECK("feedback_conversations"."status" IN ('new','open','waiting_customer','closed')),
	CONSTRAINT "feedback_conversations_last_sender_check" CHECK("feedback_conversations"."last_sender" IN ('visitor','staff')),
	CONSTRAINT "feedback_conversations_unread_check" CHECK("feedback_conversations"."unread_for_staff" >= 0 AND "feedback_conversations"."unread_for_visitor" >= 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `feedback_conversations_public_id_idx` ON `feedback_conversations` (`public_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `feedback_conversations_token_idx` ON `feedback_conversations` (`visitor_token_hash`);--> statement-breakpoint
CREATE INDEX `feedback_conversations_queue_idx` ON `feedback_conversations` (`status`,`last_message_at`);--> statement-breakpoint
CREATE TABLE `feedback_events` (
	`id` text PRIMARY KEY NOT NULL,
	`conversation_id` text NOT NULL,
	`action` text NOT NULL,
	`actor` text NOT NULL,
	`detail` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`conversation_id`) REFERENCES `feedback_conversations`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `feedback_events_conversation_idx` ON `feedback_events` (`conversation_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `feedback_messages` (
	`id` text PRIMARY KEY NOT NULL,
	`conversation_id` text NOT NULL,
	`sender` text NOT NULL,
	`body` text NOT NULL,
	`staff_id` text,
	`staff_name` text,
	`source_path` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`conversation_id`) REFERENCES `feedback_conversations`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "feedback_messages_sender_check" CHECK("feedback_messages"."sender" IN ('visitor','staff')),
	CONSTRAINT "feedback_messages_body_check" CHECK(length("feedback_messages"."body") BETWEEN 1 AND 2000)
);
--> statement-breakpoint
CREATE INDEX `feedback_messages_conversation_idx` ON `feedback_messages` (`conversation_id`,`created_at`);