# Cutover rollback triggers

Status: **draft — the thresholds are Ammre's to set before the day.** Chapter 11 `c11-triggers`.
Technical launch readiness is his call, not a member decision. Everything below is a recommendation
with a blank next to it; fill the blanks, then this is the document you act from rather than argue
from.

The point of writing this beforehand is that nobody makes a good rollback decision at the moment
they need to. Decide the numbers while nothing is broken.

## The rollback itself

One DNS record: point the apex back at `162.254.39.126`, the WordPress host.

```bash
node scripts/dns-verify.mjs                     # before, so you know the starting state
```

This works **only while the WordPress host is still running and unchanged**. That is why cancelling
the hosting sits weeks after the domain moves, not hours (`c11-keephost`). Until then the rollback
is one edit and a wait for TTL; after it, there is nothing to go back to.

Set the apex record's TTL to **300 seconds at least 24 hours before the cutover**, so a rollback
propagates in five minutes rather than an hour. Put it back to a normal value a week after.

## Triggers — decide each one

| # | Trigger | Recommended | Agreed | 
|---|---------|-------------|--------|
| 1 | Site unreachable or 5xx for more than … | 10 minutes continuous | |
| 2 | Error rate above … of requests, sustained for … | 5% for 10 minutes | |
| 3 | Median page load from two vantages above … | 5 s for 15 minutes | |
| 4 | Mail from any mailbox failing to deliver outside the domain | any failure | |
| 5 | Any customer-facing page showing another customer's data | immediate, no threshold | |
| 6 | A lot record resolving that is not released | immediate, no threshold | |
| 7 | Old URLs 404ing rather than redirecting, above … | 3 URLs | |

Triggers 5 and 6 are not performance judgements — they are the two failures that cannot be allowed
to continue for even a minute, because the harm is disclosure rather than downtime. Everything else
is a matter of degree, and the recommendation is deliberately patient: a rollback costs a second DNS
propagation and a search-engine wobble, so it is worth ten minutes of watching before calling one.

Measure trigger 3 from **two vantages** — a laptop on one network and a phone on another are enough.
A single measurement produced the withdrawn 78-second figure (chapter 11 §11.4).

```bash
npx tsx scripts/cutover-verify.ts https://nexphaselabs.net --json > vantage-a.json
# from a second machine
npx tsx scripts/cutover-verify.ts https://nexphaselabs.net --json > vantage-b.json
npx tsx scripts/cutover-verify.ts --compare vantage-a.json vantage-b.json
```

## Who calls it

| | |
|---|---|
| Calls the rollback | Ammre, alone, without waiting for anyone |
| If Ammre is unreachable | **name a person here** (`c11-fallback` / `c16-fallback`) |
| Told immediately after | Melissa, Wisam, Fatima |
| Records the decision | Ammre, as an operational case, same day |

"Without waiting for anyone" is the important line. A rollback that needs a quorum at 11pm does not
happen.

## The first hour

Run in this order, and write the answers down:

1. `npx tsx scripts/cutover-verify.ts https://nexphaselabs.net` — expect no blockers.
2. `node scripts/dns-verify.mjs` — mail records still resolve after the nameserver change.
3. Send a message from each mailbox to an outside address, and reply to it. Both directions
   (`c11-mailwatch`). Mail is the thing that breaks quietly.
4. Fetch the old URLs a searcher would still have: `/shop/`, `/product/bpc-157/`, `/privacy-policy/`.
5. Watch `npx wrangler tail` for 1102 resource-limit errors — the ones seen on 11 September.
6. Re-run step 1 from a second machine and compare.

## What is not a trigger

- A drop in search ranking. The new site deliberately abandons the query the old one ranked for;
  the members accepted that in advance (`c1-ranking`). It is the plan working, not a fault.
- Selling being unavailable. Accepted deliberately until the payment rail lands.
- The first visitor to a page paying a second or two while the edge cache is cold. Ordinary.
