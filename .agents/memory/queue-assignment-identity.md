---
name: Queue assignment identity
description: Durable identity and concurrency rule for assigning staff-owned operational work.
---

Queue ownership must reference an active staff account and retain a stable display-name snapshot for historical readability. The target must have the permission appropriate to the queue.

**Why:** Free-text owners are not accountable identities, and validating an owner only before a write leaves a race where a deactivated or newly ineligible account can receive work.

**How to apply:** Validate the selected staff identity before preparing a handoff, then repeat the active-account and role-eligibility condition in the same atomic operation that updates the queue record and appends its assignment event.