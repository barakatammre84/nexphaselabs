---
name: Consent reconciliation safety
description: Why newsletter retries must reconcile current consent rather than replay stale subscribe or unsubscribe commands.
---

Reconcile the latest consent state, not a historical provider operation. Both immediate
requests and background retries need the same race protection.

**Why:** a slow subscribe can finish after a successful unsubscribe, or vice versa.
Ignoring its completion is insufficient: the newer operation's success marker may
already say the provider agrees when the stale operation just reversed it. Timestamp
precision also means same-second transitions cannot be distinguished by time alone.

**How to apply:** guard acknowledgements atomically against the consent snapshot.
Invalidate stale acknowledgements and reconcile again after a race. Include pending
re-subscriptions in removal recovery; they have not renewed their consent yet.
Test with a simulated provider state, not only database status or request counts.
Preserve suppression independently of provider availability.