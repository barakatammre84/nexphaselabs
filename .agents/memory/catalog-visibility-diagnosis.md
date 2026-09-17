---
name: Diagnosing an empty public catalog
description: How to find out why the storefront lists nothing when production data cannot be queried directly.
---

An empty storefront is almost always a data state, not a bug in the listing code: a
product appears only when it is published, has a photograph, has an active pack with a
whole-cent price above zero, and is backed by at least one publishable lot (released,
not superseded, with testing laboratory, accession number and testing standard all
recorded and non-blank).

**Why:** those four requirements are enforced in separate places, so the visible symptom
("0 materials found") is identical whichever one is missing, and Cloudflare credentials
are usually unavailable, so the production database cannot be inspected directly.

**How to apply:** use the live sitemap as an external probe. It is generated from the
same rules and is the only public surface that separates the causes:

- Lot URLs in the sitemap come from a lots-only query with no product join. Zero lot
  URLs therefore proves no lot is publishable, which alone empties the whole catalog,
  regardless of how the products are set up.
- Product URLs require everything, so they cannot distinguish causes on their own.

Caveat: the sitemap swallows database errors and still returns the static pages, so
confirm the health endpoint reports the database as reachable before reading an empty
sitemap as a data conclusion.

Staff-side, the per-lot management page lists publication blockers, and the operational
readiness screen lists per-pack purchasability issues. Note that readiness treats a
missing photograph as an advisory issue while the storefront treats it as a hard
listing blocker, so a product can look nearly ready to staff and still be invisible.
