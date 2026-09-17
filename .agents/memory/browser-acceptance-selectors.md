---
name: Browser acceptance selectors
description: Durable selector guidance for storefront browser rehearsals
---

Browser acceptance checks should scope field and button selectors to the form
being exercised rather than querying the whole page.

**Why:** The storefront shell includes shared controls such as the newsletter
form. A global selector for a common name like `email` can resolve multiple
elements and stop a real browser rehearsal before the business flow starts.

**How to apply:** Use the target form's stable action or accessible container
first, then query its inputs and submit button. For client-rendered gates,
wait briefly for the accessible dialog to appear before interacting with it.