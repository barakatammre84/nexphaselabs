export function OrderHelp({ orderNumber }: { orderNumber: string }) {
  return (
    <aside
      className="mt-10 rounded-lg bg-secondary p-6"
      aria-label="Order support"
    >
      <h2 className="font-display text-lg font-semibold">
        Need help with this order?
      </h2>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">
        Ask about payment, delivery, or documents. Your order number is included
        in the email subject.
      </p>
      <a
        href={`mailto:research@nexphaselabs.net?subject=${encodeURIComponent(`Order support: ${orderNumber}`)}`}
        className="action-secondary mt-4"
      >
        Contact order support
      </a>
    </aside>
  );
}
