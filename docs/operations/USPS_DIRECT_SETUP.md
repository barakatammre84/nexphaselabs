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

## Ship-from address

Confirmed by the owner on 16 September 2026:

| Field | Value |
| --- | --- |
| Ship-from | 2715 W Kettleman Ln, Ste 203 #360, Lodi, CA 95242 |
| Label sender email | orders@nexphaselabs.net |
| Origin ZIP used for rating | 95242 |

This is **not** the registered business address. The entity stays registered in
Oakland (`lib/entity.ts`), and the seller's permit stays there; Lodi is only
where a parcel starts. Invoices, the about page, the legal pages and the footer
continue to say Oakland, and that is correct.

Set it as a protected value, not a wrangler var, because it carries a contact
phone and email:

```
echo '[{"id":"lodi-1","label":"Lodi","active":true,"address":{"name":"NexPhase Labs","street1":"2715 W Kettleman Ln Ste 203 #360","city":"Lodi","state":"CA","zip":"95242","country":"US","phone":"REPLACE","email":"orders@nexphaselabs.net","is_residential":false}}]' | npx wrangler secret put SHIPPO_ORIGINS_JSON --env staging
```

Run the same command without `--env staging` for production. The first active
entry is both the checkout default and the tax origin
(`configuredBusinessOrigin`), which under `TAX_PROVIDER=cdtfa` is checked only
for being in California — the rate a customer pays comes from their own
address, so moving the origin to Lodi changes nothing about what anyone is
charged.

Two open points on this address:

1. The street line has not been through USPS address standardisation, because
   the Addresses 3.0 API needs a self-service licence this account does not yet
   hold. `Ste 203 #360` is the owner's wording. If `#360` is a private mailbox
   at a commercial mail receiving agency, USPS prefers `STE 203 PMB 360`.
2. If inventory is stored and parcels are packed at Lodi, that is a **place of
   business** in CDTFA's sense — its retailer guidance counts "an office, place
   of distribution, sales or sample room or place, warehouse or storage place"
   as one, and notes that for an internet sale "a storage location is often the
   only place of business that participates in" the transaction. Two things
   follow: the location should be added to the seller's permit, and the local
   Bradley-Burns 1% on those sales would allocate to Lodi rather than Oakland.
   If the address only receives mail and stock sits elsewhere, neither follows.
   Which of the two this is has not been established, and it is not a question
   this document can settle. See
   <https://cdtfa.ca.gov/industry/local-and-district-retailer-taxes/online-retailers-registration-and-local-tax.htm>.

   Note this is about *allocation between California jurisdictions*, not about
   what a customer pays. `CDTFA_DISTRICT_RATE=destination` is unaffected.

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

**Step 2 — Enrol in USPS Ship.** *(Ready-to-send text below.)* The Labels API is not in the default API
product. USPS states: *"The Label API requires you to be enrolled in USPS Ship
for both outbound and return labels and have an active Enterprise Payment
Account."* Request it by submitting a USPS API service request from the Email
Us page on the developer portal, including: name, company, contact phone,
developer portal username, `apis.usps.com`, CRID 59918139, MID 904260903,
country and ZIP. **Never include the consumer secret in that request.** This is
a human review at USPS with an unknown lead time — start it the same day as
step 1, not after.

Submit at <https://emailus.usps.com/s/web-tools-inquiry>. Paste this, filling in
the developer-portal username:

> **Subject:** Request Labels 3.0 and Payments 3.0 API access — USPS Ship enrolment
>
> I am requesting access to the Domestic Labels 3.0 API, the Payments 3.0 API
> and the Ship Enrollment 3.0 API for our business account, and enrolment in
> USPS Ship for outbound and return labels.
>
> Name: Wisam Ibrahim
> Company: NexPhase Labs (8486 Ventures LLC)
> Contact phone: (415) 930-1422
> Contact email: sam@nexphaselabs.net
> Developer Portal username: Wisam Ibrahim
> URL being called: apis.usps.com
> Customer Registration ID (CRID): 59918139
> Mailer ID (MID): 904260903
> Label Mailer ID (MID): 904260904
> Country: United States
> ZIP Code: 94609
>
> Our app is created and approved and currently carries the default API
> product. We have confirmed via the OAuth scope list that `labels`, `payments`
> and `ship-enrollment` are not included: POST /payments/v3/payment-authorization
> and POST /ship-enrollment/v3/enrollment both return 401 "Insufficient OAuth
> scope". Our Enterprise Payment Account is created and funded. We are an
> e-commerce shipper sending domestic parcels by USPS Ground Advantage and
> Priority Mail.

Do **not** include the consumer secret; USPS says so explicitly.

**Ask for exactly three things**, and say all three in one request — each is
granted separately and a missing one means another wait in the same queue:

| Ask | Why it is needed |
| --- | --- |
| **USPS Ship enrolment** (outbound *and* return) | USPS's own stated prerequisite for the Labels API. Return labels are included now because adding them later is a second ticket. |
| **Domestic Labels 3.0 API** | Creates the label. Not in the default product. |
| **Payments 3.0 API** | Authorises the EPS account to pay for the label. Also not in the default product — proven by the 401 above. Labels without this grants a label that cannot be paid for. |
| **Ship Enrollment 3.0 API** *(secondary)* | `POST /ship-enrollment/v3/enrollment` answers whether a MID is enrolled in USPS Ship, for Outbound, Returns, both or neither, with the enrolment date. It is the only way to confirm the grant landed without attempting a purchase. Also returns 401 insufficient scope today. Ask for it, but do not let it hold up the first three. |

Optional, and only if batch hand-offs are wanted: the **SCAN Forms 3.0 API**
produces one manifest for a bundle of parcels and gets them an acceptance scan
the same day, instead of the default 12:30am CT manifest. It can be requested
later without penalty, so leave it out if a tighter request is likelier to move
faster.

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

## 5b. Flat Rate is a claim about packaging, so we check the packaging

A USPS price search returns every rate USPS *could* charge for a parcel, not
the rates we may lawfully buy. Six of the eight prices for an ordinary box come
back as Flat Rate, and a Flat Rate price is only valid if the goods actually
travel in that USPS-supplied container. Measured live, 15 September 2026, one
0.5 lb **9x6x4 in box**, 95242 to 63118:

| | Price | Ind. | Service | Why |
| --- | --- | --- | --- | --- |
| **usable** | **$8.95** | SP | Ground Advantage Single-piece | dimensional rate |
| excluded | $12.90 | FE | Flat Rate Envelope | four inches thick |
| excluded | $13.25 | FA | Legal Flat Rate Envelope | four inches thick |
| excluded | $14.00 | FP | Padded Flat Rate Envelope | four inches thick |
| usable | $24.80 | FB | Medium Flat Rate Box | fits |
| usable | $34.00 | PL | Large Flat Rate Box | fits |
| excluded | $32.55 | PM | Large Flat Rate Box APO/FPO | not stocked |
| **usable** | **$15.60** | SP | Priority Mail Single-piece | dimensional rate |

Sorting by price and taking the cheapest would have sold that **$12.90 Flat Rate
Envelope for a four-inch-thick box** — postage that cannot lawfully carry the
parcel — while also undercharging the customer $2.70 against the $15.60 that
applies. Cheapest was both unusable and wrong in the customer's favour.

Two gates now stand in the way, and both must pass:

1. **`USPS_RATE_INDICATORS`** — what packaging we stock. Currently
   `SP,FS,FB,PL,FE,FA,FP`. **Remove an indicator the day that packaging runs
   out**, or a label will be bought for a container that is not on the shelf.
   `PM` (APO/FPO) is deliberately absent.
2. **A dimensional fit test** — `FLAT_RATE_CONTAINERS` in
   `lib/usps-provider.ts` holds each container's inside dimensions, and the
   parcel is turned longest-side-to-longest-side to see whether it fits. The
   Medium box is listed in both its top-loading and side-loading shapes and a
   parcel qualifies if it fits either. Flat Rate also caps at 70 lb.

Non-flat-rate rates keep a separate guard: if USPS returns a different
`processingCategory` from the one requested, it priced a different kind of
mailpiece and the rate is dropped.

Container dimensions are USPS's published figures, **except envelope depth**,
which is ours. USPS publishes no thickness maximum for a Flat Rate Envelope —
the rule is that it must close with its own adhesive, unmodified — so a
conservative 0.75 in (1 in padded) is used rather than a guess presented as a
standard. Adjust it against a real envelope if it proves tight.

The rate's display name now comes from USPS's own product description, so the
fulfilment screen reads "Priority Mail Machinable Medium Flat Rate Box" and the
packer knows which container to reach for.

`node scripts/usps-live-check.mjs` prints this whole table live, with the reason
each rate was excluded. Run it after changing what is stocked.

---

## 5c. What else in the USPS catalogue is worth having

Every entry below was probed against the live API on 15 September 2026 rather
than read off its description, because the descriptions have been misleading
twice already.

**Self-service — do this at cop.usps.com, no support ticket.**

- **Addresses 3.0** returns **403**, and the message is the useful part: *"USPS
  implemented Addresses API Access Controls 8/1/2026. If you still require
  access, please visit the Business Portal to initiate the sign-up process (My
  Account > API Licenses > Add an Addresses API License)."* This is a licence
  the account holder grants themselves in minutes — it is **not** part of the
  support request and must not be bundled into it. Worth having: validating a
  consignee address before a label is bought is what stops a parcel being
  undeliverable, and USPS prices against the standardised ZIP+4.

**Already granted and working — buildable today, nothing to wait for.**

- **Service Standards 3.0** returns **200** right now. Asked about 95242 to
  63118 by Ground Advantage it answered `serviceStandard: "4"`,
  `serviceStandardMessage: "4 Days"`, `scheduledDeliveryDateTime`
   2026-09-19T18:00, and a 16:00 acceptance cut-off. **This is the delivery
  commitment the price search does not return**, and it means the per-class
  fallbacks currently shown (Ground Advantage 5, Priority 3) can be replaced
  with USPS's own figures. Not yet wired up.
- **Tracking 3.2** — see section 6.

**Worth adding to the support request, at the end, after the four that matter.**

- **Adjustments 3.0** (401 today). USPS re-bills when the weight or dimensions
  declared on a label differ from what its equipment measures. Those adjustments
  land against the EPS account after the fact, which means the postage figure
  recorded on a label can quietly stop being what was actually paid. For a build
  that deliberately records the charged amount, this is the API that keeps that
  record true.
- **SCAN Forms 3.0** (401 today). One manifest and one acceptance scan for a
  batch of parcels, instead of the default 12:30am CT manifest. Only matters once
  several parcels go out at once.

**Deliberately not requested.**

- **Informed Delivery Mail and Package Campaigns** — marketing creative attached
  to physical mailpieces. For this product category, promotional content riding
  on a shipment is exactly the sort of thing [[education-marketing-line]] exists
  to prevent.
- **International Labels and Prices** — shipping this catalogue across a border
  is a regulatory decision, not an integration.
- **PMOD, Containers, Appointments, Logistics Shipments, Indemnity Claims** —
  pallet, trailer and bulk-induction features for a scale this business is
  nowhere near.
- **QR Codes (Smart Locker), Carrier Pickup** — pickup happens at the counter
  from a PO Box origin.

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
- **Verified live on 15 September 2026.** `node scripts/usps-live-check.mjs`
  authenticated against `apis.usps.com` and priced a real parcel. Shapes are
  also checked against USPS's published OpenAPI spec for Labels 3.9.16, kept in
  `docs/vendor/usps-labels-3.9.16.yaml`. Re-run that script any time; it touches
  only the login and pricing endpoints and cannot buy postage.
- **Tracking already works and needs no grant.** Verified live 15 Sep 2026.
  Tracking 3.2 is `POST /tracking/v3r2/tracking` with a JSON ARRAY body of 1 to
  35 items — not a GET, which is what makes a naive port fail with an OAS
  validation error. A non-existent number returns 404 "Duplicate", which is a
  package-not-found, not a permission problem. The response carries `status`,
  `statusCategory`, `statusSummary`, `trackingEvents[]`, `uniqueTrackingID` and
  `deliveryDateExpectation`. Up to 35 numbers per call means one request can
  cover every in-transit parcel, which suits the existing `*/5` cron. Note the
  legacy `/tracking/v3` path returns 401 for new users and retires 31 Jul 2027 —
  use v3r2 only. The site's tracking pipeline is still pointed at Shippo
  (`lib/shippo-tracking.ts`) and has not yet been ported.
- **USPS returns no delivery commitment from the price search.** Every rate came
  back with no `commitment` object at all. The delivery-day figures shown are
  our own per-class fallbacks (Ground Advantage 5, Priority 3, Express 1) and
  must not be presented to a customer as a USPS guarantee. Real commitments need
  the Service Standards API, which the app already has access to and which is
  not wired up.
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
