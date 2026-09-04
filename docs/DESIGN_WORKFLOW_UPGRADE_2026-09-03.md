# Storefront and workflow upgrade

Scope: the five-part upgrade approved after the Contour Clinical comparison:
accuracy/navigation, access onboarding, storefront design, customer order workspace,
and staff queues. This is not a declaration that every business-launch dependency
is complete. WordPress, production DNS, customer eligibility, pricing rules,
payment processing, and named lot release remain unchanged.

## Design direction

- White #FFFFFF, laboratory gray #F1F6F8, ink navy #071A2C, action blue #096B87,
  muted slate #58707C, border #CDDCDF.
- Retain Sora for display, Source Sans 3 for readable interface/body text, and
  IBM Plex Mono for identifiers and scientific values. Labels use sentence case.
- Left-aligned content; quieter navigation; one product image and headline in
  the homepage hero. Catalog images sit in a spaced grid. Operational screens
  prioritize filters, records, and next actions over large decorative headers.
- Do not copy competitor claims, consumer checkout, product photos, or ratings.
  Existing photos are reference images, not selected pack-size evidence.

Layout:

    Brand       Catalog / Documents / Help       Search / Account / Access or Cart
    Research-use and staging notices
    Headline + browse action     Reference material image
    Catalog and chemical classes
    Access steps and documentation

## Implemented loops

1. Accuracy and navigation: removed the erroneous first-pack quantity from the
   hero caption; labeled reference photography; made sign-in accessible on mobile;
   added catalog search by name, code, CAS, and synonyms with reset and empty states.
2. Onboarding: separated login creation from purchasing approval; added four-step
   progress; surfaced existing review messages on the account page; linked directly
   to update/resubmit; retained the existing form and document upload workflow.
3. Storefront: refreshed header, spacing, type hierarchy, contrast, catalog cards,
   and product section navigation; kept research-use conditions in page bodies.
4. Order workspace: added state-specific next steps, materials/payment/delivery
   navigation, order-specific support email links, clearer cart instructions, and
   a deliberate cancellation disclosure. No-method and missing-instruction states
   direct the customer to support instead of offering an unusable payment action.
5. Staff: dashboard order, verification, and lot tiles open matching queues;
   order search filters before database pagination; each order shows its next
   handoff without changing authorization or state transitions.

## Re-evaluation fixes

- Mobile menu initially remained open across navigation: added close-on-navigation,
  outside-click dismissal, and Escape support while preserving native disclosure.
- Moved catalog and product supply conditions earlier in the layout.
- Changed hero image fit so the caption does not cover the vial label.
- Bounded search input and handled repeated/non-string parameters without errors.
- Tested old actionable orders beyond the first 50, refunded/cancelled states,
  safe review-message escaping, and signed-in versus signed-out navigation.

## Verification

- Type checking, lint, and staging build passed during implementation.
- Automated tests cover pure workflow rules, real local SQLite order search and
  pagination, account/header rendering, and customer payment exception rendering.
- Browser checks: search success and no-result recovery, mobile menu navigation,
  390px catalog/product layouts without horizontal overflow, product section jumps,
  and public approval/price gating. No external account, payment, or order created.
- Existing missing product photographs stay honestly labeled; no replacement
  photos, shipping promises, or compliance claims were invented.
- Authenticated page states were tested through server-rendering fixtures and
  database tests, not by impersonating a real customer or staff member in staging.

## Release safety

Implementation used the isolated reliability release checkout based on the last
verified staging release. Sync only the listed UI files back to the main project
after matching their pre-edit contents. Do not include Claude's uncommitted COA
implementation in this deployment. Final staging version and verification are
recorded below after deployment.
