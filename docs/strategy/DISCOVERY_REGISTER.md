# Chapter 1 — Discovery Register

Source: NexPhase Launch Register, chapter 1 ("Discovery"), claude.ai artifact
`0439543f-3bd3-40fb-a0e0-f8c53d46d1b4`, updated 12 September 2026. Artifact text mirrored verbatim in
`2026-09-12-discovery-register-artifact.txt`. Parent register: `997fc7b6-a540-4deb-88d0-abc3ddcff2be`.

Kept the same way as [RELEASE_ENGINEERING_REGISTER.md](RELEASE_ENGINEERING_REGISTER.md): one item at
a time, complete means evidence, anything needing a person is `owner action`, new findings are added
here as `c1-new-N`, and every change is appended to the log at the bottom.

## Items

| # | id | Item | Owner | When | Status |
|---|----|------|-------|------|--------|
| 1 | `c1-urls` | Pull the full indexed URL list from the sitemap index and Search Console | Ammre | blocks order #1 | **done** (sitemaps) · Search Console is an owner action |
| 2 | `c1-redirects` | Build the per-URL redirect map | Ammre | blocks order #1 | **done** |
| 3 | `c1-410` | Return 410 rather than 404 for withdrawn product pages | Ammre | blocks order #1 | **done** |
| 4 | `c1-sitemap` | Ship `/sitemap.xml` before the domain moves | Ammre | blocks order #1 | **done** (shipped 12 Sep, now verified) |
| 5 | `c1-lotpages` | Include released lot pages in the sitemap, and only released ones | Ammre | blocks order #1 | **done** (verified against eight ways a lot can be unpublishable) |
| 6 | `c1-robots` | Review `robots.ts` against the new path structure | Ammre | first month | **done** |
| 7 | `c1-gsc` | Verify Search Console for the new property before the cutover | Ammre | blocks order #1 | owner action |
| 8 | `c1-ranking` | Record the ranking drop as an accepted consequence | Melissa + Wisam | blocks order #1 | owner action |
| 9 | `c1-identity` | Complete chemical identity fields on every product actually in inventory | Melissa | first month | owner action |
| 10 | `c1-accession` | Make lot pages searchable by accession number as well as lot number | Ammre | first month | **done** (already shipped; covered by tests/lot-search.test.ts) |
| 11 | `c1-methods` | Write the methods content, not compound content | Melissa | first month | owner action |
| 12 | `c1-adjacency` | Write the adjacency rule into the guardrail specification | Melissa | blocks order #1 | owner action |
| 13 | `c1-metrics` | Report identity queries separately from brand queries | Ammre | first month | owner action |
| 14 | `c1-title` | Rewrite titles and meta descriptions for the new positioning | Melissa | first month | owner action |

Found during this pass:

| # | id | Item | Owner | When | Status |
|---|----|------|-------|------|--------|
| — | — | — | — | — | — |

## Item detail

### 1. `c1-urls` — the full indexed URL list

**Done 12 September 2026**, for the part that does not need a login. All seven child sitemaps were
fetched from the live site and every `<loc>` extracted:
`docs/strategy/2026-09-12-wordpress-indexed-urls.txt`.

| Child sitemap | URLs |
|---|---|
| `archives-sitemap-1` | 2 |
| `post-type-page-sitemap-1` | 17 |
| `post-type-post-sitemap-1` | 1 |
| `post-type-product-sitemap-1` | 7 |
| `post-type-sureforms_form-sitemap-1` | 1 |
| `taxonomy-type-category-sitemap-1` | 1 |
| `taxonomy-type-product_cat-sitemap-1` | 1 |
| **distinct paths** | **29** |

Seven product pages are indexed, including `/product/tesamorelin/`, `/product/nexphase-2t/` and
`/product/nexphase-3r/` — the three products the code catalog does not sell.

**Still an owner action:** Search Console. It holds URLs that are indexed but not in a sitemap, and
nobody but the property owner can read it. Export the Pages report and add anything missing to the
file above; the redirect map below is built to be extended rather than rewritten.

### 4/5. `c1-sitemap`, `c1-lotpages` — the sitemap

The chapter says `/sitemap.xml` returns 404 and calls it the most consequential missing file on the
site. It was shipped in the 12 September launch pass (`49ea91f`), after the chapter was written:
`app/sitemap.ts` returns 200 on the built worker.

It already does what §1.3 asks — static pages, published products, and **released lots only**, via
`listPublishableLotNumbers()` — and returns an empty sitemap outside production so a staging origin
never competes with the domain. To verify rather than assume, and to keep it that way.

### 2/3. `c1-redirects`, `c1-410` — the redirect map

**Done 12 September 2026.** Every one of the 29 indexed paths now has a decision, and none of them
is a 404.

`lib/legacy-redirects.ts` holds the map and `worker.ts` applies it before the framework handler ever
runs — so a legacy URL costs one small function call and never touches the database.

| Old path | Now | Why |
|---|---|---|
| `/about/`, `/faq/`, `/contact/` | 301 to the same page | Direct equivalents exist |
| `/shop/` | 301 `/catalog` | The closest thing, and it carries the page's authority |
| `/product-category/research-peptides/` | 301 `/catalog` | Real authority for the category term |
| `/privacy-policy/`, `/shipping-policy/`, `/terms-of-service/`, `/refund_returns/` | 301 into `/legal/…` | Same documents, new home |
| `/disclaimer/` | 301 `/legal/terms` | The research-use notice lives in the terms and in the body of every page |
| `/form/simple-contact-form/` | 301 `/contact` | The one indexed form is the contact form |
| `/cart/`, `/checkout/`, `/my-account/`, `/customer-dashboard/`, `/customer-cabinet/` | **410** | Genuinely gone; they should never have been indexed |
| `/shop-2/`, `/accessibility-statement/`, `/hello-world/`, `/category/uncategorized/`, `/form/` | **410** | Gone |
| `/product/<slug>/` | 301 or 410, decided per product | Below |

Decisions that took thought rather than transcription:

- **No blanket homepage redirect**, anywhere. A test asserts it: a search engine reads that as a
  soft 404 and it looks like an error to a person.
- **Product pages are not decided in code.** `app/product/[slug]/route.ts` looks the slug up in the
  catalog: published → 301 to `/catalog/<slug>`; anything else → 410. Which products exist is data,
  so a product withdrawn tomorrow changes its own answer and nobody has to remember to edit a map.
  If the catalog cannot be read, it answers **302 to `/catalog`** rather than 410 — a temporary
  redirect is reversible, and telling a search engine a page is permanently gone because a database
  blinked is not.
- **Prefixes as well as paths**, because Search Console will turn up URLs no sitemap listed:
  `/my-account/*`, `/checkout/*`, `/cart/*`, `/tag/*`, `/author/*`, `/category/*` are 410 by shape,
  and any other `/product-category/*` keeps its authority on `/catalog`.
- **Trailing slashes and case** are normalised, since every WordPress URL carries a slash. The
  worker also strips the slash from `/product/<slug>/` before the framework sees it, so an indexed
  product URL reaches its new page in **one** hop rather than two.
- 301s and 410s are cacheable for an hour — long enough to matter, short enough that a deliberate
  reinstatement is not fought by every CDN in the path.

`tests/legacy-redirects.test.ts` — 16 tests, driven by the mirrored URL list itself, so the map
cannot drift from what is actually indexed. One of them resolves every 301 target against the `app`
directory: a redirect that points at a page this build does not have fails the suite.

Proven on the built worker:

```
/shop/                                301 → /catalog
/privacy-policy/                      301 → /legal/privacy
/cart/  /checkout/  /my-account/orders/   410
/product/bpc-157/                     301 → /catalog/bpc-157   (one hop, 200)
/product/ghk-cu/                      301 → /catalog/ghk-cu    (one hop, 200)
/product/tesamorelin/                 410
/product/nexphase-2t/                 410
/product/never-existed/               410
/product/..%2f..%2fetc                410
```

Tesamorelin, NexPhase-2T and NexPhase-3R are indexed on the old site and are not in the catalog, so
they answer 410 — which is the register's rule applied by the data, not a product decision taken
here. If the members decide any of them should be sold, publishing it in the catalog manager changes
the answer with no code change.

### 4/5. `c1-sitemap`, `c1-lotpages` — verified

`tests/sitemap.test.ts` — 8 tests against a real SQLite database. It lists the twelve static pages
and published products only, and it lists a released lot. The one that matters is the leak test: a
lot is kept out when it is **quarantined, held, rejected, withdrawn, superseded by a correction, or
released but missing its analytical lab, accession number or testing standard** — all eight ways the
publication rule can fail. The sitemap must not hand over what the public API deliberately 404s.

It is also empty outside production, and still ships the static pages when the database is
unreadable rather than 500ing.

### 6. `c1-robots` — reviewed against the current routes

**Done 12 September 2026.** `/manage`, `/staff`, `/api` and `/account` were already out. Added: the
**query-string forms** of the public pages — `/catalog?`, `/catalog/*?` and
`/documentation/lot-lookup?` — which are search results, filter permutations and post-action flags,
every one a duplicate of a page already in the sitemap.

Deliberately left crawlable: `/product/<slug>`. Those are the old WordPress URLs, they now answer
301 and 410, and a crawler has to be allowed to fetch them to learn that. Blocking them in robots.txt
would leave the old URLs indexed indefinitely — the exact opposite of the intent.

### 10. `c1-accession` — already shipped

`searchReleasedLots()` in `lib/lots-public.ts` matches the accession number as well as the lot
number, product code and product name, case-insensitively, and `tests/lot-search.test.ts` covers it.
Shipped with the lot provenance search; nothing to build.

## Change log

- **2026-09-12 (worked)** — Closed `c1-redirects`, `c1-410`, `c1-robots`, and verified
  `c1-sitemap`, `c1-lotpages` and `c1-accession` with tests rather than assumption. The cutover no
  longer 404s a single indexed URL. What remains in this chapter is Search Console (`c1-gsc`,
  and the second half of `c1-urls`), the accepted ranking drop, and the content items that are
  Melissa's.
- **2026-09-12** — Chapter pulled, mirrored, and each item checked against the tree. Three items
  (`c1-sitemap`, `c1-lotpages`, `c1-accession`) were found already built by the launch pass and are
  marked for verification rather than work. `c1-urls` closed for the sitemap half: 29 indexed paths
  pulled from the live site.
