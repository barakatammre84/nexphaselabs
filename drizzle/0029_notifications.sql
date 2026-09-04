CREATE TABLE `notification_events` (
	`id` text PRIMARY KEY NOT NULL,
	`notification_id` text NOT NULL,
	`action` text NOT NULL,
	`actor` text NOT NULL,
	`detail` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `notification_events_notification_idx` ON `notification_events` (`notification_id`);--> statement-breakpoint
CREATE TABLE `notifications` (
	`id` text PRIMARY KEY NOT NULL,
	`order_number` text NOT NULL,
	`recipient` text NOT NULL,
	`subject` text NOT NULL,
	`body` text NOT NULL,
	`envelope` text,
	`status` text DEFAULT 'pending' NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`next_attempt_at` integer DEFAULT (unixepoch()) NOT NULL,
	`first_attempt_at` integer,
	`lease_id` text,
	`lease_until` integer,
	`accepted_at` integer,
	`provider_id` text,
	`last_error` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `notifications_due_idx` ON `notifications` (`status`,`next_attempt_at`);
--> statement-breakpoint
-- Atomic with the business event: a crash after an order transaction cannot
-- lose its notification. No historical backfill and no authentication tokens.
CREATE TRIGGER order_event_notification AFTER INSERT ON order_events
BEGIN
  INSERT INTO notifications (id, order_number, recipient, subject, body)
  SELECT 'order:' || NEW.id, o.order_number,
    (SELECT email FROM accounts WHERE id = o.account_id),
    'Update for order ' || o.order_number || ' — NexPhase Labs',
    'An update has been recorded for order ' || o.order_number || '. Current order status: ' || o.status || '. Payment status: ' || o.payment_status || '. Sign in to view payment instructions, shipment tracking, return or refund details.'
  FROM orders o WHERE o.id = NEW.order_id;
END;
