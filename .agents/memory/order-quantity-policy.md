---
name: Available-stock order policy
description: Distinguishes removing per-line quantity limits from future-stock ordering.
---

The owner wants available-stock orders without an arbitrary per-line quantity cap. Do not interpret that as authorization for backorders or collection on restock.

**Why:** Future-stock orders were explicitly separated from this change; invoice-on-restock versus automatic collection remains an owner decision. Existing release, QC, inventory allocation, parcel and payment policies still apply.

**How to apply:** Reject unsafe arithmetic explicitly rather than replacing a customer's quantity. Obtain the owner's restock-payment choice before designing future-stock checkout.