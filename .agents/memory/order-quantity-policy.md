---
name: Available-stock order policy
description: Distinguishes removing per-line quantity limits from future-stock ordering.
---

The owner wants available-stock orders without an arbitrary per-line quantity cap. Do not interpret that as authorization to enable backorders.

**Why:** Future-stock orders were explicitly separated from this change. On September 17, 2026, the owner selected automatic collection with explicit checkout consent and an email 48 hours before charging, for planning only. Existing release, QC, inventory allocation, parcel and payment policies still apply.

**How to apply:** Reject unsafe arithmetic explicitly rather than replacing a customer's quantity. Use `docs/FUTURE_STOCK_PAYMENT_PLAN.md` for the separate plan. Do not silently substitute invoicing if automatic collection is unsupported; provider eligibility and launch authorization remain prerequisites.