CREATE TABLE `marketing_consents` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`account_id` text,
	`status` text DEFAULT 'pending' NOT NULL,
	`source` text NOT NULL,
	`requested_at` integer NOT NULL,
	`consented_at` integer,
	`revoked_at` integer,
	`revoke_reason` text,
	`client_address` text,
	`user_agent` text,
	`confirm_token_hash` text,
	`unsubscribe_token` text NOT NULL,
	`brevo_synced_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `marketing_consents_email_idx` ON `marketing_consents` (`email`);--> statement-breakpoint
CREATE UNIQUE INDEX `marketing_consents_unsubscribe_idx` ON `marketing_consents` (`unsubscribe_token`);--> statement-breakpoint
CREATE INDEX `marketing_consents_status_idx` ON `marketing_consents` (`status`);--> statement-breakpoint
CREATE TABLE `cart_reminders` (
	`id` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`cart_fingerprint` text NOT NULL,
	`recipient` text NOT NULL,
	`sent_at` integer NOT NULL,
	`provider_id` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `cart_reminders_cart_idx` ON `cart_reminders` (`account_id`,`cart_fingerprint`);
