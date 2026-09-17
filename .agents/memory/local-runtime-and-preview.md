---
name: Local runtime and preview
description: Environment constraints for running the local D1 workflow and storefront preview
---

The local D1 commands require Node 22 or newer because Wrangler rejects Node 20. The Replit webview workflow must pass `--host 0.0.0.0 --port 5000` to vinext; its default port is 3000.

**Why:** A Node 20 runtime blocked local migration and seeding, and the first preview workflow timed out because it waited for port 5000 while vinext listened on port 3000.

**How to apply:** Preserve the Node 22 runtime module and use the explicit 5000 host/port workflow command when starting the local storefront.