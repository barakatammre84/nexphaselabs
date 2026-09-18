---
name: Server-action browser harnesses
description: How private browser rehearsals exercise server-action forms without a running framework server.
---

Static React rendering replaces a function-valued form action with a non-submittable placeholder. A private browser rehearsal must render the same production view with a string POST endpoint, then have that endpoint call the real server action and render its returned state.

**Why:** The isolated browser tests intentionally use a private HTTP server, mocked request scope, and local D1 instead of credentials or a running deployment. Native form submission still needs a real URL and explicit POST method.

**How to apply:** Keep production state/action hooks in a thin wrapper and export the exact form view for the harness. Do not duplicate the form markup or transaction behavior in test-only HTML.