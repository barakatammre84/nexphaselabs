---
name: Inventory reservations
description: Fail-safe checkout policy for scarce inventory.
---

Every accepted order must atomically reserve allocatable stock. Missing, malformed, zero, or out-of-range reservation-duration configuration must use a bounded safe default rather than selecting an unreserved checkout path.

**Why:** A read-only stock check lets concurrent buyers all purchase the same lot, causing overselling and refund obligations.

**How to apply:** Keep the reservation guard and reservation-row inserts in the same order transaction. Deployment configuration may tune hold duration, but must not disable atomic holds.