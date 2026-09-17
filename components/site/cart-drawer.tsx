'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { AlertCircle, Minus, Plus, ShoppingCart, Trash2, X } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { CartSummary } from '@/lib/cart-summary';

/** Dispatched by the product page after a successful add; the drawer opens and reloads. */
export const CART_OPEN_EVENT = 'nx:cart-open';
/** Dispatched by anything that changed the cart elsewhere; the drawer reloads its count. */
export const CART_UPDATED_EVENT = 'nx:cart-updated';

const money = (cents: number) =>
  `$${(cents / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/**
 * The side cart (owner, 16 Sep 2026): the header cart opens a panel beside the
 * page, as the reference store's does, instead of leaving the page. Lines can
 * be changed here; the cart page stays the place where an order is submitted.
 * Signed-in accounts only — the header renders a sign-in link for everyone else.
 */
export function CartDrawer({ initialCount }: { initialCount: number }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [cart, setCart] = useState<CartSummary | null>(null);
  const [count, setCount] = useState(initialCount);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  const load = useCallback(async () => {
    try {
      const response = await fetch('/api/cart', {
        headers: { Accept: 'application/json' },
        credentials: 'same-origin',
      });
      const data = (await response.json()) as (CartSummary & { ok: true }) | { ok: false; error: string };
      if (!response.ok || !data.ok) {
        setError('error' in data ? data.error : 'The cart could not be loaded.');
        return;
      }
      setCart(data);
      setCount(data.count);
      setError(null);
    } catch {
      setError('The cart could not be loaded.');
    }
  }, []);

  useEffect(() => {
    const onOpen = () => {
      setOpen(true);
      void load();
    };
    const onUpdated = () => void load();
    window.addEventListener(CART_OPEN_EVENT, onOpen);
    window.addEventListener(CART_UPDATED_EVENT, onUpdated);
    return () => {
      window.removeEventListener(CART_OPEN_EVENT, onOpen);
      window.removeEventListener(CART_UPDATED_EVENT, onUpdated);
    };
  }, [load]);

  useEffect(() => setOpen(false), [pathname]);

  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    closeRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const update = async (itemId: string, quantity: number) => {
    setBusy(true);
    try {
      const body = new FormData();
      body.set('item', itemId);
      body.set('quantity', String(quantity));
      if (quantity <= 0) body.set('remove', '1');
      const response = await fetch('/api/cart/update', {
        method: 'POST',
        body,
        headers: { Accept: 'application/json' },
        credentials: 'same-origin',
      });
      const data = (await response.json().catch(() => null)) as (CartSummary & { ok: true }) | { ok: false; error: string } | null;
      if (!data || !data.ok) {
        setError(data && 'error' in data ? data.error : 'That change could not be made.');
        return;
      }
      setCart(data);
      setCount(data.count);
      setError(null);
    } catch {
      setError('That change could not be made.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <button
        type="button"
        className="header-cart-link"
        aria-label={`Cart, ${count} ${count === 1 ? 'item' : 'items'}`}
        aria-expanded={open}
        onClick={() => {
          setOpen(true);
          void load();
        }}
      >
        <ShoppingCart className="size-4" />
        Cart
        <span className="header-cart-count" aria-hidden="true">
          {count}
        </span>
      </button>
      {open && (
        <div className="cart-drawer-layer" role="presentation" onMouseDown={() => setOpen(false)}>
          <aside
            className="cart-drawer"
            role="dialog"
            aria-modal="true"
            aria-label="Your cart"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-4 border-b border-border px-6 py-5">
              <div className="flex items-center gap-3">
                <ShoppingCart className="size-5 text-primary" />
                <h2 className="font-display text-xl font-bold tracking-tight">Your cart</h2>
                <span className="header-cart-count">{count}</span>
              </div>
              <button
                ref={closeRef}
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close cart"
                className="grid size-10 place-items-center rounded-full hover:bg-secondary"
              >
                <X className="size-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-6 py-5">
              {error && (
                <p role="alert" className="mb-4 flex items-center gap-2 rounded-xl border border-destructive/40 bg-secondary p-4 text-sm">
                  <AlertCircle className="size-4 text-destructive" /> {error}
                </p>
              )}
              {!cart && !error && <p className="text-sm text-muted-foreground">Loading your cart…</p>}
              {cart && cart.lines.length === 0 && (
                <div className="py-10 text-center">
                  <p className="font-semibold">Your cart is empty.</p>
                  <Link href="/catalog" className="action-primary mt-5 inline-flex" onClick={() => setOpen(false)}>
                    Return to shop
                  </Link>
                </div>
              )}
              {cart && cart.lines.length > 0 && (
                <ul className="divide-y divide-border">
                  {cart.lines.map((line) => (
                    <li key={line.itemId} className="flex gap-4 py-4">
                      <div className="min-w-0 flex-1">
                        <Link
                          href={`/catalog/${line.productSlug}`}
                          className="font-semibold hover:text-primary"
                          onClick={() => setOpen(false)}
                        >
                          {line.productName}
                        </Link>
                        <p className="mt-1 font-mono text-xs text-muted-foreground">
                          {line.pack} · {line.sku}
                        </p>
                        {line.problem && (
                          <p className="mt-2 text-xs font-semibold text-destructive">{line.problem}</p>
                        )}
                        <div className="mt-3 flex items-center gap-2">
                          <button
                            type="button"
                            disabled={busy || line.quantity <= 1}
                            onClick={() => void update(line.itemId, line.quantity - 1)}
                            aria-label={`Decrease quantity of ${line.productName}`}
                            className="grid size-8 place-items-center rounded-full border border-border hover:bg-secondary disabled:opacity-40"
                          >
                            <Minus className="size-3.5" />
                          </button>
                          <output className="w-8 text-center font-mono text-sm font-bold" aria-label="Quantity">
                            {line.quantity}
                          </output>
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => void update(line.itemId, line.quantity + 1)}
                            aria-label={`Increase quantity of ${line.productName}`}
                            className="grid size-8 place-items-center rounded-full border border-border hover:bg-secondary disabled:opacity-40"
                          >
                            <Plus className="size-3.5" />
                          </button>
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => void update(line.itemId, 0)}
                            aria-label={`Remove ${line.productName} from the cart`}
                            className="ml-2 inline-flex items-center gap-1 text-xs font-semibold text-muted-foreground hover:text-destructive disabled:opacity-40"
                          >
                            <Trash2 className="size-3.5" /> Remove
                          </button>
                        </div>
                      </div>
                      <div className="text-right font-mono text-sm">
                        {line.lineTotalCents === null ? '—' : money(line.lineTotalCents)}
                        {line.unitPriceCents !== null && line.quantity > 1 && (
                          <p className="mt-1 text-xs text-muted-foreground">{money(line.unitPriceCents)} each</p>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="border-t border-border px-6 py-5">
              {cart && cart.lines.length > 0 && (
                <div className="flex items-center justify-between text-sm">
                  <span className="font-semibold">Subtotal</span>
                  <span className="font-mono font-bold">{money(cart.subtotalCents)}</span>
                </div>
              )}
              <p className="mt-2 text-xs leading-5 text-muted-foreground">
                Shipping and tax appear before payment. For laboratory research use only.
              </p>
              <div className="mt-4 grid gap-3">
                <Link
                  href="/account/cart"
                  className="action-primary justify-center"
                  onClick={() => setOpen(false)}
                >
                  View cart &amp; check out
                </Link>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="inline-flex h-12 items-center justify-center rounded-full border border-border px-5 text-sm font-bold hover:bg-secondary"
                >
                  Continue shopping
                </button>
              </div>
            </div>
          </aside>
        </div>
      )}
    </>
  );
}
