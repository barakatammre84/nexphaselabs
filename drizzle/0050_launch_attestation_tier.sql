ALTER TABLE `accounts` ADD `research_setting` text;--> statement-breakpoint
ALTER TABLE `order_items` ADD `coa_document_id` text;--> statement-breakpoint
ALTER TABLE `order_items` ADD `coa_sha256` text;--> statement-breakpoint
ALTER TABLE `order_items` ADD `sds_document_id` text;--> statement-breakpoint
ALTER TABLE `order_items` ADD `sds_sha256` text;--> statement-breakpoint
ALTER TABLE `orders` ADD `ruo_version` text;--> statement-breakpoint
ALTER TABLE `orders` ADD `terms_version` text;--> statement-breakpoint
ALTER TABLE `orders` ADD `acknowledgement_hash` text;--> statement-breakpoint
ALTER TABLE `orders` ADD `acknowledged_at` integer;--> statement-breakpoint
ALTER TABLE `orders` ADD `acknowledged_from` text;--> statement-breakpoint
ALTER TABLE `orders` ADD `research_setting` text;--> statement-breakpoint
-- 2026-09-12: the 'consumer' tier is retired. The qualifying question is only whether the buyer is a
-- researcher, never whether they are an individual or an organisation, and a schema that classified
-- buyers as consumers contradicted the research-use position. Existing rows are relabelled in place.
UPDATE `accounts` SET `tier` = 'researcher' WHERE `tier` = 'consumer';--> statement-breakpoint
UPDATE `orders` SET `price_tier` = 'researcher' WHERE `price_tier` = 'consumer';
