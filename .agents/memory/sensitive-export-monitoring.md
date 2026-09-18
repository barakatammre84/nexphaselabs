---
name: Sensitive export monitoring
description: Policy constraints for monitoring and retaining sensitive report-export metadata.
---

Sensitive report monitoring stores actor, approved purpose, report scope, filters, row count, and timestamps only. It must never copy exported customer rows into monitoring storage. Open alerts keep their source metadata until review even when the normal audit retention period has elapsed.

**Why:** Monitoring must make unusual access actionable without creating another store of sensitive customer data or deleting evidence for an unresolved investigation.

**How to apply:** Keep new export types on the same approved-purpose and metadata-only path. Any cleanup or alert-resolution change must preserve source metadata until the alert is resolved.