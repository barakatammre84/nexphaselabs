# Chapter 10 — Customer Register

Source: NexPhase Launch Register, chapter 10 ("Customer record"), claude.ai artifact
`b1253d43-5831-4cc8-b3fd-c2f802aa59ab`, 12 September 2026. Artifact text mirrored in
`2026-09-12-customer-register-artifact.txt`. Parent: `997fc7b6-a540-4deb-88d0-abc3ddcff2be`.

Kept the same way as the other chapters here. The chapter's own framing is worth repeating because it
decides the priority: **the customer profile is a recall asset before it is a sales feature.** Without
it you cannot identify who received a bad lot.

## Items

| # | id | Item | Owner | When | Status |
|---|----|------|-------|------|--------|
| 1 | `c10-policy` | Write the customer profile data policy | Fatima | critical path | owner action |
| 2 | `c10-verify` | Verify the customer email before the order ships | Ammre | critical path | open |
| 3 | `c10-reach` | Add a reachability state to every customer record | Ammre | critical path | **done** |
| 4 | `c10-mockrecall` | Run the mock recall against seeded records and count who you could reach | Melissa | critical path | **now answerable** · owner action to run |
| 5 | `c10-addresses` | Build saved addresses | Ammre | critical path | open |
| 6 | `c10-history` | Show the customer their orders, lines and their own lot numbers | Ammre | first month | **already built** — verify |
| 7 | `c10-reorder` | Build reorder as start-a-new-order-from-this-one | Ammre | first month | open |
| 8 | `c10-pin` | COA and SDS pinned to the order line at dispatch | Ammre | critical path | **built 12 Sep** |
| 9 | `c10-pinonly` | The customer document route resolves only through the pin | Ammre | critical path | **built 12 Sep** |
| 10 | `c10-pintest` | Write the supersession acceptance test | Ammre | critical path | **done** |
| 11 | `c10-immutable` | Make issued document objects permanent in R2 lifecycle rules | Ammre | critical path | owner action |
| 12 | `c10-supersede` | Add `supersededById` to `lotDocuments` | Ammre | first month | **done** |
| 13 | `c10-docs` | Build the customer document locker on top of the pins | Ammre | first month | open |
| 14 | `c10-dropdown` | Research-setting dropdown replaces free-text institution | Fatima | first month | **built 12 Sep** |
| 15 | `c10-noresid` | No residential-address flag anywhere | Ammre | first month | **built 12 Sep** |
| 16 | `c10-tier` | The tier is `researcher` | Ammre | critical path | **built 12 Sep** |
| 17 | `c10-staffpage` | Build the staff customer page | Ammre | first month | open |
| 18 | `c10-notes` | Add attributed, dated customer notes | Ammre | first month | open |
| 19 | `c10-segments` | Approve the segmentation rules | Melissa | first month | owner action |
| 20 | `c10-consent` | Build the consent record for anything beyond transactional mail | Fatima | first month | open |
| 21 | `c10-retention` | Get retention and deletion advised | Counsel | first month | owner action |
| 22 | `c10-perms` | Define who sees which customer data | Ammre | first month | blocked on F-03 |

## Item detail

### 10. `c10-pintest` — the supersession acceptance test

**Done 13 September 2026.** The chapter says: *"Until that test passes, treat the document locker as
unbuilt — the whole point of it is that it cannot be wrong."*

`tests/document-pin-supersession.test.ts` runs the scenario exactly as specified, against a real
SQLite database, the real dispatch path, the real supersession path and real bytes in a stand-in
bucket. Nothing is stubbed but the bucket.

| | |
|---|---|
| Issue COA v1, ship order A | line A pins v1 and its SHA-256 |
| Supersede with v2 | the current certificate changes; **A still resolves to v1** |
| Ship order B | line B pins v2 |
| Issue v3 tomorrow | **neither A nor B changes** |

Four more properties the chapter implies and the test pins:

- **The bytes match the hash recorded at dispatch** — re-hashed from the bucket, compared with the
  pin, and the content still says `v1`.
- **The superseded object is never deleted or overwritten**: both files remain, supersession is a new
  row, and the certificate count goes 1 → 2 rather than being edited in place.
- **The SDS in force that day is pinned too**, not just the certificate.
- **An honest gap rather than a plausible wrong document**: a line shipped with nothing uploaded has
  no pin and stays that way even after a certificate is uploaded later. It does not retroactively
  attach, and the route does not fall back to "the current COA for this lot".
- **One order's pin is not served to another order**, in either direction.

The implementation passed all of it on the first run, which is the outcome worth having: the test was
written to find out, not to confirm.

### 12. `c10-supersede` — the chain now names its replacement

`lotDocuments` recorded `supersededAt` but nothing pointing at what replaced the document, so the
chain broke at the lot-document level even though `issuedDocuments` models it correctly — a
customer's pinned certificate could be known to be superseded with no way to name the revision.

Migration `0053_document_supersede_pointer.sql` adds `superseded_by_id`, and `attachLotDocument()`
now generates the replacement's id before the batch so the update that supersedes the old rows can
record it. A test walks a three-deep chain: v1 → v2 → v3, with the head unsuperseded and the
customer's pin sitting at the tail.

This is what `c10-docs` will need to show the chapter's §10.5 point 4 — the pinned document as
primary, with "a revised certificate for this lot was issued on …" beneath it, never swapped.

### 3. `c10-reach` — reachability

**Done 13 September 2026.** `lib/customer-reachability.ts`, surfaced on the lot page.

Three states, and the distinctions are the point:

| State | Meaning |
|---|---|
| **reachable** | The address is verified, or a notice to it was accepted by the mail provider. |
| **unproven** | Never verified and nothing conclusive has been sent. Not a problem yet — a risk to measure. |
| **unreachable** | No address at all, or the last notice to it failed. |

- **Accepted is never called delivered.** A provider accepting a message says the handoff worked, not
  that a human received it — the same distinction the rest of this codebase already refuses to blur.
  A test asserts the word "delivered" does not appear in the result.
- **A queued notice proves nothing.** Placing an order raises several notices that sit pending; the
  state is taken from the last *conclusive* outcome, so five pending messages never outrank a bounce.
- **A second route is recorded separately** — a phone number is the only way to reach someone when
  mail itself is the thing that is broken, which is exactly the case during a mail misconfiguration.
- **A guest contact is an order snapshot, not a verified identity** (§10.8), so an account's
  verification only counts when it belongs to the same address.

`tests/customer-reachability.test.ts` — 14 tests.

### 4. `c10-mockrecall` — now answerable

The lot page at `/manage/lots/<lot>` has a **"Who received this lot"** panel above the movement
ledger: every consignee with their order, destination, packs, contact and reachability state, and a
summary line — *N reachable, N unproven, N not reachable, N with a phone number*.

That summary is the number §10.6 asks for: *"Then run the mock recall against seeded customer records
and count how many you could actually reach. That number is the honest measure of whether this
chapter is done."*

**The query is deliberately built on the order lines stamped at dispatch, never on `lotMovements`.**
The movement ledger is append-only and stays internal to inventory; widening a second read path into
it would erode the boundary that keeps it out of the public lookup. A test asserts the ledger is
populated and the query still answers from orders.

**Still an owner action:** running the rehearsal and recording the number. The tool now exists; the
rehearsal is Melissa's.

### 6. `c10-history` — already built

`app/account/orders/[orderNumber]/page.tsx` already shows the customer their own lot number for each
line, linked to the public released-lot page. The narrow account-scoped read is `getOrderForAccount`.
Nothing to build; worth keeping in the register so the boundary rule is not lost in a refactor.

## Change log

- **2026-09-13** — Closed `c10-pintest` (the test that gates the document locker; it passed against
  the real supersession path), `c10-supersede` (migration 0053 plus the write that fills it), and
  `c10-reach` with the consignee panel that makes `c10-mockrecall` answerable. Confirmed `c10-history`
  already built. Chapter pulled and mirrored the same day.
