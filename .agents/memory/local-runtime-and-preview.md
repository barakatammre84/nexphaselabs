---
name: Local runtime and preview
description: Environment constraints for running the local D1 workflow and storefront preview
---

The local D1 commands require Node 22 or newer because Wrangler rejects Node 20. The Replit webview workflow must pass `--host 0.0.0.0 --port 5000` to vinext; its default port is 3000.

**Why:** A Node 20 runtime blocked local migration and seeding, and the first preview workflow timed out because it waited for port 5000 while vinext listened on port 3000.

**How to apply:** Preserve the Node 22 runtime module and use the explicit 5000 host/port workflow command when starting the local storefront.

A persisted development-server lock is not proof that a preview server is alive.

**Why:** A carried-over vinext lock blocked managed startup even though the named process was absent from the shell and the preview refused connections. Restarting alone did not resolve it.

**How to apply:** Corroborate an "already running" banner with process identity and the serving endpoint before acting. Remove only a confirmed stale lock; never blindly kill its recorded PID, which may be reused.