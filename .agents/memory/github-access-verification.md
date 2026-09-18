---
name: GitHub access verification
description: Distinguish active integration metadata from usable repository and workspace authentication.
---

An active GitHub App connection does not prove that repository API calls or Git
commands are authenticated in the current execution environment.

**Why:** An accepted connection reported automatic CLI authentication, but the
workspace CLI still requested login, a bounded remote-ref lookup timed out, and
the documented connector proxy did not expose that connection. Repeating
repository-permission prompts cannot establish whether the credential handoff
works.

**How to apply:** Verify access with a read-only repository request and a bounded
remote-ref lookup. Treat stale tracking refs as local metadata, not proof of
current synchronization. If the connection is active but credentials are
unavailable in this context, report that distinction instead of claiming all
repositories are accessible or repeatedly requesting authorization.