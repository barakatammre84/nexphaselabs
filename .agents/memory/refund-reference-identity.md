---
name: Refund reference identity
description: Reference reuse and historical refund safety decisions
---

Refund references identify one external refund per order. A repeat is rejected without changing money or audit events, even if intervening refunds or completion changed the balance. Trim surrounding whitespace, but preserve the reference itself; do not truncate or case-fold opaque provider identifiers.

**Why:** Optimistic balance checks prevent stale writes, not sequential fresh-read retries. A reference reused with a different amount is a conflict, not a top-up.

**How to apply:** Keep identity enforcement atomic with totals and the existing audit trail. Distinct-reference refunds may top up the balance; duplicate errors must remain meaningful after completion.

Historical refund references must be reserved without automatically correcting totals or inferring confirmed bank amounts from audit prose.

**Why:** Older duplicated entries may already overstate refunds, but local application history cannot establish what money actually moved. Historical corrections require separately authorized reconciliation.

**How to apply:** Keep legacy identity protection fail-closed; don't turn a migration into a financial-history rewrite.