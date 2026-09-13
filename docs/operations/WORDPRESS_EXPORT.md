# WordPress export — before anything else

Status: procedure, ready to run. Chapter 11 `c11-export` and `c11-exportrec`. **Step 0 of the
cutover, and the only step that cannot be undone by skipping it.**

The new application and the old store share a domain name and nothing else. No data moves between
them. When the hosting is cancelled, whatever was in WordPress is gone — and if anyone ever asks what
was sold before launch (a regulator, an insurer, an acquirer, a customer), this export is the only
answer that will exist.

Do it now. It does not need the cutover date, it changes nothing, and it can be repeated.

## Where it goes first

A dedicated folder in **the company's** storage, not a personal drive, not a laptop folder:

```
NexPhase Labs / Operations / WordPress archive 2026-09 /
```

Restrict it to the members. It contains customer names, addresses and order history.

## What to export

Work down the list. Tick each one in the record at the bottom.

| # | What | Where in WordPress | Format |
|---|------|--------------------|--------|
| 1 | **Customers**, including anyone who registered and never ordered | Users → All Users → Export, or WooCommerce → Customers | CSV |
| 2 | **Orders and line items**, whatever the store shows | WooCommerce → Orders → Export, or Tools → Export → Orders | CSV |
| 3 | **Payment records from SureCart**, including partial and abandoned transactions | SureCart → Orders / Purchases → Export | CSV |
| 4 | **Products**, so the withdrawn ones are documented as having existed | Products → Export | CSV |
| 5 | **All pages and posts**, in case a redirect decision needs reversing | Tools → Export → All content | WXR (XML) |
| 6 | **The media library** | Tools → Export → Media, or download `wp-content/uploads` over SFTP | ZIP |
| 7 | **A full site backup** (files + database) | Host control panel → Backup, or the backup plugin if one is installed | archive |

Item 7 is the belt-and-braces copy: if any of the CSV exports turns out to be incomplete, the raw
database is the only way to recover what was there.

Also keep, because they are evidence of what the old site said:

- A crawl or PDF of `/shop`, each `/product/<slug>`, and the policy pages as they stand on the last
  day. The claims on those pages are what a regulator would be reading, and after the cutover they
  exist nowhere.
- `docs/strategy/2026-09-12-wordpress-indexed-urls.txt` — already in this repository, the list of
  every indexed URL taken from the live sitemaps.

## Then check it, before trusting it

- Open each CSV and confirm it has rows, not just headers.
- Count the orders in the export against the order count the store shows.
- Confirm the earliest and latest order dates match what the store shows.
- Confirm at least one customer record contains an address, not just an email.
- Confirm the media ZIP opens and contains the product images.

An export nobody opened is not a backup.

## The record

Fill this in and keep it with the files. This is `c11-exportrec`.

| Field | Entry |
|---|---|
| Exported by | |
| Date and time | |
| WordPress version / plugin versions | |
| Stored where (full path, whose account) | |
| Who has access | |
| 1. Customers — rows | |
| 2. Orders — rows, date range | |
| 3. SureCart payments — rows, total value | |
| 4. Products — rows | |
| 5. Content (WXR) — size | |
| 6. Media — file count, size | |
| 7. Full backup — size, restore tested? | |
| Checks above completed by | |
| Retention decision (how long, who reviews) | |
| Witnessed by | |

Retention is a member decision (`c11-decom`). Until it is made, keep everything.

## What this does not authorise

Exporting is not decommissioning. **Keep the WordPress host running and unchanged** after the domain
moves — it is the entire rollback plan (`c11-keephost`). Cancelling the hosting is the last
irreversible step and sits weeks later, after the members decide the old store's fate.
