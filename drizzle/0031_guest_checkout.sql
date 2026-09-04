-- Guest checkout contact is not a verified identity or account login.
ALTER TABLE `orders` ADD `contact_email` text;
--> statement-breakpoint
DROP TRIGGER order_event_notification;
--> statement-breakpoint
CREATE TRIGGER order_event_notification AFTER INSERT ON order_events
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
