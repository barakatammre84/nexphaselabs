CREATE TABLE `order_refund_references` (
  `order_id` text NOT NULL REFERENCES `orders`(`id`),
  `reference` text NOT NULL,
  `amount_cents` integer,
  CONSTRAINT `order_refund_references_amount_check` CHECK (`amount_cents` IS NULL OR `amount_cents` > 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `order_refund_references_order_reference_idx`
  ON `order_refund_references` (`order_id`, `reference`);
--> statement-breakpoint
-- Reserve references from the canonical historic refund notes, including older
-- top-ups no longer present in orders.refund_ref. NULL means a legacy amount is
-- unknown; these keys reject reuse without rewriting financial history.
INSERT OR IGNORE INTO `order_refund_references` (`order_id`, `reference`)
SELECT `order_id`,
       trim(substr(`note`, instr(`note`, '). Reference: ') + 14,
                   length(`note`) - instr(`note`, '). Reference: ') - 14))
FROM `order_events`
WHERE `note` LIKE 'Refund of $% recorded (% owed). Reference: %.'
  AND instr(`note`, '). Reference: ') > 0;
--> statement-breakpoint
-- Older records may have only the order-level reference.
INSERT OR IGNORE INTO `order_refund_references` (`order_id`, `reference`)
SELECT `id`, trim(`refund_ref`) FROM `orders`
WHERE COALESCE(`refund_cents`, 0) > 0 AND length(trim(`refund_ref`)) > 0;