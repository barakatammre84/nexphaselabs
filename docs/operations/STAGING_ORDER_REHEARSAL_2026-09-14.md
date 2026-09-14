# Staging order and Zelle rehearsal — 14 September 2026

This record covers the synthetic end-to-end order rehearsal on the public
staging Worker. It is launch evidence for the order, payment, fulfillment,
shipping, return, and refund controls. It is not evidence that a live bank
transfer or a live parcel moved.

## Build and environment

- Reviewed commit: `c756f44e473a6ca15e2e83e78f12edcf4bfe0ded`
- GitHub staging run: [34888139271](https://github.com/barakatammre84/nexphaselabs.net/actions/runs/34888139271), successful
- Staging Worker version: `6497b17c-afd8-44c3-b2ce-5a871ff181cd`
- Health result: application, D1, and document storage all healthy
- Staging remained public with `noindex`; staff and private routes retained
  their application authentication.

## Safety boundary

- The checkout displayed the synthetic Zelle recipient
  `test-zelle@nexphaselabs.invalid` and the name `TEST ONLY — NO PAYMENT`.
- No Chase session was opened, no bank account was contacted, and no money was
  sent.
- The customer email used the reserved `.invalid` domain, so no customer
  message was delivered.
- Shippo returned a test rate. The recorded shipment, tracking, delivery,
  return, and refund references were explicitly synthetic.

## Reconciled record

Order `NX-260914-0002` completed this sequence without a database edit:

| Checkpoint | Result |
| --- | --- |
| Catalog and cart | One GHK-Cu 50 mg pack accepted from an available product. |
| Delivery and tax | USPS Ground Advantage test rate: $5.58 shipping, $2.85 tax, $37.43 total. |
| Customer payment choice | Zelle simulation selected; customer reported payer name `Synthetic Zelle Payer Two`. |
| Staff payment review | Payment recorded with reference `TEST-STAFF-REVIEW-NX-260914-0002`; the Zelle claim changed from pending to matched. |
| Fulfillment | The existing reservation selected released lot `GHKCU50-2605-01`. |
| Shipment and delivery | Synthetic carrier, tracking, ship date, and delivery evidence recorded. |
| Return | One pack received into the return ledger and quarantined; sellable inventory was not restored. |
| Refund | $29.00 became due and a $29.00 refund was recorded with reference `TEST-REFUND-NX-260914-0002-2`. The order ended `shipped` / `refunded`. |

The order history contains the submitted, awaiting-payment, paid, fulfilling,
shipped, delivered, returned, and refunded events with an attributed actor.
The refund request returned the normal success redirect on this build; the
Worker resource-limit response seen during the earlier rehearsal did not
recur.

## Cleanup and remaining proof

The temporary staging administrator was deactivated, both of its sessions were
removed, and its local password and cookie files were removed. Four standing
active staff accounts remain.

This closes the synthetic Zelle claim-to-staff-review path and the mechanical
order lifecycle rehearsal. Launch still requires the active DNS zone to be
identified and reconciled, Google mail authentication and external delivery to
be proven, recovery credentials and a restore rehearsal, a verified WordPress
export, agreed rollback thresholds and a fallback operator, and real production
inventory to be entered and released. Live Chase receipt ingestion also remains
unconfigured; production therefore stays in manual Zelle review mode.
