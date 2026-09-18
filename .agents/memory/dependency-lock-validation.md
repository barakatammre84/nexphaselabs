---
name: Dependency lock validation
description: Package-lock behavior under Replit's package firewall and post-merge setup
---

When repairing or regenerating package-lock.json, validate the exact post-merge `npm ci` path in the Replit environment instead of trusting a public-registry lockfile alone. The package firewall may serve a valid tarball whose integrity hash differs from the public registry entry.

**Why:** A merged lockfile mixed Vitest major versions, and restoring the public metadata still failed because the firewall-served Vitest tarball used a different integrity hash. Setup succeeded only after the lock entry matched the artifact actually served locally.

**How to apply:** Keep package.json and package-lock.json on the same dependency graph, run the configured post-merge setup, and treat `EINTEGRITY` as an environment-specific lock validation failure. Do not change application dependencies just to bypass npm's check.