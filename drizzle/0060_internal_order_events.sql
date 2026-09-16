-- An order event is the order's audit trail, and not every entry in it is news
-- for the customer. A staff-to-staff ownership handoff (lib/order-handoffs.ts)
-- changes no status, no payment and no shipment, yet it inserts an order_events
-- row -- so the notification trigger fired and sent the buyer a content-free
-- "An update has been recorded for order NX-...". Internal workflow reaching
-- customers is noise, and it trains people to ignore the mail that matters.
--
-- Internal entries are now marked and the trigger skips them. The event is still
-- written, so the audit trail is unchanged; only the customer notice stops.
-- The trigger body below is identical to 0031_guest_checkout.sql. The one change
-- is the WHEN clause.
ALTER TABLE `order_events` ADD `internal` integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
DROP TRIGGER order_event_notification;
--> statement-breakpoint
CREATE TRIGGER order_event_notification AFTER INSERT ON order_events
WHEN NEW.internal = 0
BEGIN
  INSERT INTO notifications (id, order_number, recipient, subject, body)
  SELECT 'order:' || NEW.id, o.order_number,
    COALESCE(NULLIF(o.contact_email, ''), (SELECT email FROM accounts WHERE id = o.account_id)),
    'Update for order ' || o.order_number || ' — NexPhase Labs',
    'An update has been recorded for order ' || o.order_number || '. Current order status: ' || o.status || '. Payment status: ' || o.payment_status || '. ' ||
    CASE WHEN o.channel = 'guest_checkout'
      THEN 'Open your order in the same browser used at checkout to view payment instructions and delivery details. Keep your order number for support.'
      ELSE 'Sign in to view payment instructions, shipment tracking, return or refund details.' END
  FROM orders o WHERE o.id = NEW.order_id;
END;
