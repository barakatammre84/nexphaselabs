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

On the Replit x64 runner, a partially populated Rolldown native package can
contain an ELF binding with missing section headers. Importing Rolldown then
ends in a bus error before Vitest or vinext can report an application error.

**Why:** Reinstalling ordinary JavaScript packages repaired missing declaration
files, but the native Rolldown binding remained invalid and blocked both tests
and preview startup.

**How to apply:** When Vitest and vinext both exit with only `Bus error`, test a
direct Rolldown import and inspect the native binding with `file`; treat missing
ELF section headers as an environment/package integrity failure, not a source
regression.

Exclusive browser test selection must not rely on merging two `test.include`
arrays with Vite's `mergeConfig`; those arrays are additive.

**Why:** An opt-in browser run unexpectedly executed the whole unit suite when
the base and browser include lists were merged, mixing unrelated results into
the browser evidence.

**How to apply:** Reuse resolution settings but explicitly construct the browser
test configuration when the intent is to run only browser scenarios.