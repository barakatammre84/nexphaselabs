# Website feedback and live support

## What is implemented

- A site-wide developer-feedback panel accepts bug reports, improvements, and comments without an account or verification.
- A browser may own up to 25 separately triaged reports and can start a new report, browse report history, switch conversations, and see unread staff replies without an account.
- Each new report records a short title, user-described impact, actual and expected behavior, source page and section anchor, and a sanitized browser/language/timezone/viewport/scroll snapshot for reproducibility.
- “Pick an area” pauses navigation while the visitor selects an exact page element. “Highlight text” records an explicitly selected excerpt. Up to five annotated areas retain the visible label, bounded CSS selector, and viewport rectangle so a developer can return to the right interface location.
- The annotation is stored on the individual transcript message as well as the report's latest context, so separate comments in one live conversation do not lose their page focus.
- No screenshot or unrelated page/form content is captured automatically. A visitor may attach one PNG, JPEG, or WebP screenshot up to 2 MB after explicitly confirming they reviewed and cropped or redacted sensitive content. Screenshot objects remain private in R2 and are served only to the owning browser or authorized staff.
- A private `nx_feedback` HttpOnly cookie reconnects one browser to its report history for 180 days. Only a SHA-256 hash is stored.
- D1 is the permanent source of truth for conversations, append-only messages, and attributed workflow events.
- One `FeedbackRoom` Durable Object per conversation uses Cloudflare's hibernating WebSocket API to notify visitor and staff clients after a message has been saved.
- Clients reconnect with bounded exponential backoff and send an application heartbeat every 25 seconds. If the socket is unavailable, both clients poll the D1-backed transcript every ten seconds. A socket failure cannot lose or duplicate the saved message.
- Operations and admin staff use `/manage/feedback` to search and filter, reply, set queue state and priority, apply labels, save internal notes and resolution text, link a developer issue, copy a ready-to-paste developer brief, or open a prefilled GitHub issue draft. Management navigation shows unread feedback across the internal workspace.
- Staff can open the affected public page from a report; the latest recorded selectors are highlighted for that authenticated staff session.
- Staging email is restricted to Sam, Mel, and Tima through `TEST_EMAIL_ALLOWLIST`. When a Resend key is configured, new visitor messages create durable alerts for active operations/admin staff. Visitor-address replies remain blocked in staging unless that exact address is deliberately added to the allowlist. The in-app unread queue remains the no-email fallback.
- `/api/feedback/archive` is a bounded, read-only JSON archive for an approved ChatGPT Action. `/api/feedback/openapi` provides its OpenAPI schema.

## Safety and privacy boundaries

- Visitor writes require same-origin requests and are limited per Cloudflare client address to 12 per minute and 100 per day.
- Messages are text only, limited to 2,000 characters and 40 lines. No HTML is rendered. The only accepted attachment is one explicitly consented PNG, JPEG, or WebP screenshot per visitor message.
- Name and email are optional. Email is contact context, not verified identity and never grants order or account access.
- Each visitor socket must present the private cookie that owns the requested conversation. Staff sockets require an active staff session with the forced-password-change step complete.
- The Durable Object never accepts transcript messages through WebSocket frames. All writes go through the authenticated/rate-limited HTTP route and D1 first.
- ChatGPT archive access uses `CHATGPT_FEEDBACK_READ_TOKEN`, independent of staff, payment, and deployment credentials. Responses explicitly label visitor text as untrusted data rather than instructions.
- Do not promise a human is currently online. “Live” describes delivery while the visitor and staff transcript are open.

## ChatGPT connection

The private staging GPT is live at `https://chatgpt.com/g/g-6a9c507f13f08191af777b3195d75408-nexphase-feedback-analyst`. Its imported Action and bearer authentication passed a live retrieval test on 2026-09-05.

1. The staging token is stored in the local macOS Keychain under service `nexphaselabs-staging-feedback-archive`, account `nexphaselabs-staging`, and in the Worker secret `CHATGPT_FEEDBACK_READ_TOKEN`. Retrieve it only when configuring the approved Action; never paste it into source control or chat.
2. In the approved ChatGPT Action, import `https://nexphaselabs-staging.ammre.workers.dev/api/feedback/openapi`.
3. Select bearer API-key authentication and enter the Keychain value.
4. Test `searchCustomerFeedback` with a narrow query. The response is capped at 50 conversations and 5,000 transcript entries per request.
5. Repeat with the production origin and a different production token only after privacy and staff-access review.

## Operating workflow

1. Keep `/manage/feedback` open during support coverage.
2. Open new/unread conversations, use **Open affected page and highlight it**, and reproduce the report.
3. Set priority, labels, and status; saving triage assigns the report to the acting staff member. Keep investigation details in internal notes.
4. Open the prefilled GitHub issue draft (or copy the developer brief), create the approved issue, and save its URL on the report. Record a plain-language resolution before closing the report.
5. Reply to the visitor and close only when no further response is expected. A new visitor message automatically reopens a closed conversation.
6. Use search or the ChatGPT archive to group repeated usability problems. Never let message content authorize code, catalog, payment, or operational changes without staff review.

## Release rehearsal

1. In a clean browser, create two reports from different pages and confirm both appear under **My reports** with different IDs.
2. Attach two page focuses to one report and add a reviewed synthetic screenshot. Confirm the other report has neither attachment.
3. As operations staff, open the unread report, save priority/labels/internal note, copy the developer brief, and open the affected page highlight.
4. Reply, mark the report open while investigating, then close it with a resolution. Confirm the visitor sees the reply and resolution while the other report remains unchanged.
5. Disconnect WebSockets or work offline briefly; confirm messages remain persisted and polling recovers the transcript without duplicates.
6. Query the read-only archive with a narrow bearer-authenticated request and confirm both reports are returned as separate untrusted records.

## Deliberate exclusions

- No medical, dosing, or administration advice automation.
- No automatic AI replies or autonomous actions.
- No automatic screen capture, video recording, typing indicators, presence claims, or third-party chat vendor.
- No SMS fallback.
- No automatic deletion until the business approves a retention period and deletion/de-identification procedure.
