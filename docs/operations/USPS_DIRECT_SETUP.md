# Buying postage directly from USPS

**Written 15 September 2026.** Replaces Shippo as the label path for
nexphaselabs.net. Shippo is still in the codebase and still works; this is a
switch, not a deletion, so nothing here can stop a launch.

---

## 1. Why direct, and what it costs us

The ship-from is a PO Box in ZIP 95242. UPS and FedEx do not collect from a PO
Box; USPS does. So the carrier question was already settled by the origin, and
once there is only one carrier, a rate-shopping reseller in the middle is
paying for a comparison that never happens. Buying direct also keeps the
shipment record — the thing that ends up in `lot_movements` next to a lot
number — between this business and the Postal Service, with no third party
holding a copy.

What it costs: USPS gates label purchase behind two enrolments that Shippo
already had on our behalf. Those are §3 below, and they are the only reason
this is not finished today.

`/legal/shipping` has been changed to name USPS alone, because it named UPS and
FedEx and we cannot ship by either from a PO Box.

---

## 2. The account as it actually stands

Registered 15 September 2026 in the USPS Business Customer Onboarding Portal
(cop.usps.com), in **Wisam Ibrahim's** name — consistent with Wisam holding the
existing USPS business account.

| Field | Value |
| --- | --- |
| Company | NexPhaseLabs |
| Registered address | 3883 Turquoise Way Apt 2309, Oakland, CA 94609-2998 |
| Contact | Wisam Ibrahim · (415) 930-1422 · sam@nexphaselabs.net |
| Customer Registration ID (CRID) | 59918139 |
| Master Mailer ID (MID) | 904260903 |
| Label Mailer ID (MID) | 904260904 |
| Enterprise Payment System (EPS) account | **not yet created** |
| Developer app / consumer key | **not yet created** |

Two things to notice. The registered address is the Oakland apartment, which is
also the tax origin; the PO Box is the ship-from and they are allowed to differ
(`senderAddress` vs `fromAddress` in the USPS model, and
`SHIPPO_ORIGINS_JSON` vs `configuredBusinessOrigin()` in ours). And the
developer-portal account at developers.usps.com is documentation only — it
carries no credentials. Credentials come from the COP portal.

---

## 3. What has to happen, in order

Steps 1–3 are Ammre's or Wisam's. They involve money and identity and cannot be
done from here.

**Step 1 — Add the payment account (EPS).** cop.usps.com → the onboarding page
already sitting at "Add Your Payment Account" → accept the Payment Account
Terms → add a bank account (ACH) and fund it. Postage is drawn from this
balance at the moment each label is bought. Write down the **EPS account
number**. Nothing else on this list can proceed first.

**Step 2 — Enrol in USPS Ship.** The Labels API is not in the default API
product. USPS states: *"The Label API requires you to be enrolled in USPS Ship
for both outbound and return labels and have an active Enterprise Payment
Account."* Request it by submitting a USPS API service request from the Email
Us page on the developer portal, including: name, company, contact phone,
developer portal username, `apis.usps.com`, CRID 59918139, MID 904260903,
country and ZIP. **Never include the consumer secret in that request.** This is
a human review at USPS with an unknown lead time — start it the same day as
step 1, not after.

**Step 3 — Create the app and take the credentials.** cop.usps.com → My Apps →
Developer Apps → Add App → select the APIs → Add App → Manage → copy the
**Consumer Key** and **Consumer Secret**. The default product already includes
OAuth, Addresses, Domestic Pricing, Tracking and more; Labels appears here only
after step 2 is granted.

**Step 4 — Set the configuration.** Claude does this once the values exist. The
secret is set with `wrangler secret put` and is never written into
`wrangler.jsonc`, a file, or this chat.

```
# wrangler.jsonc vars (not secret)
SHIPPING_PROVIDER      = "usps"
USPS_CLIENT_ID         = <consumer key>
USPS_CRID              = "59918139"
USPS_MID               = "904260903"
USPS_MANIFEST_MID      = "904260903"
USPS_EPS_ACCOUNT_NUMBER= <from step 1>
USPS_MAIL_CLASSES      = "USPS_GROUND_ADVANTAGE,PRIORITY_MAIL"

# secret
npx wrangler secret put USPS_CLIENT_SECRET
```

`LIVE_SHIPPING_ENABLED=true` is still required in production, unchanged.

---

## 4. What works before all of that

Rating and tracking do **not** need EPS or USPS Ship. As soon as step 3 is done
and the client id/secret are set, quoting works — at **retail** prices, and the
quote says so in its warning. Commercial pricing switches on by itself the
moment `USPS_EPS_ACCOUNT_NUMBER` is set, because that is what USPS prices
against. Label purchase refuses, in writing, until the EPS number is present:
*"USPS label purchase needs an Enterprise Payment System account number and
USPS Ship enrolment. No label was bought."*

So the useful order is: step 3 first for real prices at checkout, steps 1 and 2
running in parallel for labels.

---

## 5. How the code behaves

`SHIPPING_PROVIDER` picks the path — `simulated`, `shippo`, or `usps`. Nothing
else changes; `lib/shipping-labels.ts` and every staff screen are unchanged and
provider-agnostic.

Three things are worth knowing because USPS is not shaped like a reseller.

**Rate identifiers are ours, not USPS's.** USPS returns prices, not something
you can buy later; the label request restates the whole parcel. So a USPS rate
id encodes the exact ingredients — `usps-GA-SP-M-95242-63118-50-900-600-400-815`
is Ground Advantage, rate indicator SP, machinable, those two ZIPs, 0.50 lb,
9×6×4 in, 815 cents. It is written to `fulfillment_quotes` and read back at
purchase; it never passes through a browser. A rate quoted for a different
route is refused rather than silently repriced.

**One label per claim, enforced at USPS.** USPS will sell the same parcel twice
— `POST /labels/v3/label` is explicitly not idempotent. The durable
`shipping_labels` claim row id is 32 hex characters, so it is reused verbatim
as the `X-Idempotency-Key` UUID. A retry of the same claim cannot buy a second
label, and that same key is the handle USPS uses for reprint and cancellation.

**The response is flat, and postage is not what was quoted.** In the
`application/vnd.usps.labels+json` body, `LabelVendorResponse` is an `allOf`
over `LabelMetadata`, so `trackingNumber`, `postage`, `warnings` and
`labelImage` all sit at the top level — `labelAddress` is the standardised
address, not a metadata container. USPS also reprices at label time, so the
`postage` it returns is the figure EPS is charged and it can differ from the
quote. The label row records the charged amount; the quote row keeps the shown
amount.

**The label is bytes, not a link.** USPS returns a base64 PDF. It is checked for
a real `%PDF` header, written to the private R2 bucket under
`shipping-labels/<year>/<label id>.pdf`, and recorded as `r2:<key>`. The staff
route streams it behind the existing login instead of redirecting off-origin.
No label is ever public.

---

## 6. Known limits, stated plainly

- **Refund disputes cannot be read back.** Cancelling an unused label is
  immediate and settles cleanly. Once USPS has manifested a label, cancellation
  becomes a refund *dispute* with a `disputeId`, and USPS exposes no endpoint to
  read its outcome. The code reports that as unresolved and tells staff to check
  the Business Customer Gateway — it never reports money returned that it cannot
  see. Any such label stays out of the shipped path until a human records the
  result.
- **One carrier.** There is no UPS or FedEx comparison any more, by design and
  by the PO Box.
- **Quoted postage is not the invoice.** USPS reprices at label time; the actual
  postage comes back on the label response and is what EPS is charged.
- **Quoted postage is an estimate; the label carries the real figure.** See
  above. The `shipping_labels` row records what USPS actually charged, while
  the `fulfillment_quotes` row keeps what the customer was shown, so a
  divergence is visible rather than absorbed.
- **Untested against the live API.** No call has been made with a real consumer
  key, because none exists yet. Every request and response shape is now checked
  against USPS's published OpenAPI spec for Labels 3.9.16, kept in
  `docs/vendor/usps-labels-3.9.16.yaml`. The first live quote after step 3 is
  still the real proof, and should be done on staging (`apis-tem.usps.com`,
  which this code selects automatically outside production).
- **PO Box number outstanding.** The ship-from ZIP is 95242; the box number
  arrives Saturday and must be in `SHIPPO_ORIGINS_JSON` before a label is bought.

---

## 7. Separate finding, not USPS

While reading the shipping origin code: `lib/tax-provider.ts` supports a
**`cdtfa`** provider as well as `simulated` and `taxjar`. Earlier notes recorded
TaxJar as the only production option and therefore the longest external
dependency before launch. If nexus is California only, `TAX_PROVIDER=cdtfa`
appears to remove the TaxJar signup from the critical path entirely. That is an
accountant's call, not an engineering one — but it is worth asking before paying
for TaxJar.
