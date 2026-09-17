---
name: Framework dependency upgrades
description: Coordinated peer-family upgrades required by this project's vinext and Cloudflare toolchain.
---

Treat vinext, React, React DOM, React server components, and the Vite RSC plugin as one upgrade set. Treat Wrangler, the Cloudflare Vite plugin, and Cloudflare workers types as another upgrade set.

**Why:** Security upgrades of only the vulnerable parent exposed successive peer-resolution conflicts. Updating each family together preserved npm's peer checks without force or legacy resolution.

**How to apply:** When one package in either family must move, inspect current peer requirements and upgrade all required peers in the same dependency transaction. Keep safe versions exact after npm completes.