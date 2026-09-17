---
name: Runtime validation
description: Node runtime requirements that affect the project's tests and build.
---

The project declares Node 22.13 or newer. Running the full validation suite on
Node 20 is not a valid project result: the SQLite-backed tests fail because
`node:sqlite` is unavailable, and the build can fail before application code is
loaded because current Node filesystem APIs are missing.

**Why:** The repository uses Node built-ins that are newer than the runtime
available in some worker shells.

**How to apply:** Check `node --version` before diagnosing broad test or build
failures. Use a Node 22.13+ runtime for complete validation; targeted tests
that do not import the SQLite helper can still provide useful coverage.