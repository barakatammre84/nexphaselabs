ALTER TABLE `feedback_messages`
ADD `report_title` text;
--> statement-breakpoint
ALTER TABLE `feedback_messages`
ADD `report_kind` text
CHECK (`report_kind` IS NULL OR `report_kind` IN ('bug','improvement','comment'));
--> statement-breakpoint
ALTER TABLE `feedback_messages`
ADD `report_severity` text
CHECK (`report_severity` IS NULL OR `report_severity` IN ('blocking','major','minor','suggestion'));
--> statement-breakpoint
ALTER TABLE `feedback_messages`
ADD `expected_behavior` text;
--> statement-breakpoint
ALTER TABLE `feedback_messages`
ADD `browser_context` text;
