# Project scope

This is an existing live store. Preserve its Cloudflare deployment, database,
stack, and repository structure. The owner's priority is finding and fixing
bugs in live customer and staff workflows, not rebuilding or migrating the app.

Keep fixes targeted. Use local or staging checks to reproduce and protect the
affected live behavior, not as a reason to expand into unrelated test projects.
Distinguish observations from the deployed site from findings in newer workspace
code. Production investigation must not place test orders, alter buyer data,
send customer messages, trigger payments, or purchase shipping labels.

# Payment scope

The owner confirmed on September 18, 2026 that ACH and Zelle are approved for
the current catalog; credit-card processing is still being arranged. Treat this
as the owner's stated scope, not independent provider or legal verification.
Do not present card checkout as available before its approval and integration.