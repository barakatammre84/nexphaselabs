---
name: Custom-domain deployment drift
description: Diagnosing a custom domain that serves older UI than the current workspace
---

When a live custom domain renders a materially older form than the workspace source, treat it as deployment drift first rather than a local application regression. Compare live field names and controls with the current source, and verify that the domain is attached to the workspace's current published deployment before changing application logic.

**Why:** The live signup page can remain on an older published build while the current workspace and local preview contain a later signup refactor. In that state, local tests passing does not explain the production behavior, and source edits will not affect the domain until the correct workspace is published.

**How to apply:** For production UI bugs, inspect the live HTML and deployment metadata together. If the domain serves stale controls or copy and the workspace has no active deployment metadata, publish the current workspace or resolve the domain-to-deployment association before further debugging.