---
name: Diagnosing an empty public catalog
description: How to find out why the storefront lists nothing when production data cannot be queried directly.
---

Treat a static-only sitemap as inconclusive, not proof that production has no
publishable lots. Listing data, query failures, and differences between the deployed
release and workspace code can produce the same public symptom.

**Why:** an earlier investigation overstated this conclusion. A healthy database
connection does not establish that the actual sitemap queries succeeded.

**How to apply:** use public sitemap results as supporting evidence only. Confirm
the deployed query outcome through staff diagnostics, read-only production data,
or runtime logs before naming the missing production prerequisite. Do not relax
publication safeguards merely to make an empty catalog display products.
