ALTER TABLE `feedback_conversations`
ADD `kind` text DEFAULT 'comment' NOT NULL
CHECK (`kind` IN ('bug','improvement','comment'));
--> statement-breakpoint
ALTER TABLE `feedback_conversations`
ADD `severity` text DEFAULT 'suggestion' NOT NULL
CHECK (`severity` IN ('blocking','major','minor','suggestion'));
--> statement-breakpoint
ALTER TABLE `feedback_conversations`
ADD `expected_behavior` text;
--> statement-breakpoint
ALTER TABLE `feedback_conversations`
ADD `browser_context` text;
