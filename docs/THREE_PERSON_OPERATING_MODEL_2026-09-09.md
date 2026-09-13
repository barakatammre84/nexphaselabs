# NexPhase three-person operating model

Status: recommended role design and application authority template. Insert the three members’ names and obtain member approval before treating it as issued authority.

## Recommendation

Use three named primary roles, one individual account per person, and no shared credentials:

1. **Business & Systems Lead (`admin`)** — owner for governance, commercial decisions, customer/organization approval, payment and refund approval, sensitive reporting, Google Workspace, Cloudflare, Shippo administration, continuity, and access reviews. This is the combined technology and business-consultant seat requested by the members.
2. **Quality & Supply Lead (`qc`)** — owner for product scientific content, supplier-quality evidence review, receipt/quarantine records, analytical results, COA/SDS control, lot release/hold/reject/withdraw decisions, and quality cases.
3. **Customer & Fulfillment Lead (`ops`)** — owner for supplier records and purchase orders, daily customer/order queue, reservations, pick/pack/ship, label and carrier handoff, inventory decreases, delivery exceptions, returns, and customer feedback.

The model follows three principles: responsibilities must be explicit and supported by competent people; sensitive duties should be separated; and access should be limited to what each person needs. These principles are consistent with ISO’s quality-management guidance, NIST AC-5/AC-6, and SBA small-business security guidance.

## Decision rights and handoffs

| Workflow | Accountable | Performs | Required handoff / independent check |
| --- | --- | --- | --- |
| Staff access and quarterly review | Business & Systems | Business & Systems | Another member reviews the exported access matrix and unexplained admin use. |
| Supplier record | Customer & Fulfillment | Customer & Fulfillment | Quality reviews qualification evidence before purchase. |
| Supplier qualification | Quality & Supply | Quality & Supply | Business approves commercial terms separately; the creator does not approve its own unsupported evidence. |
| Purchase order | Business & Systems | Customer & Fulfillment | Business approves amount/terms before transmission; Quality confirms supplier scope. |
| Receipt and quarantine | Quality & Supply | Quality with Operations custody handoff | Quantity/condition are witnessed when variance exists. |
| Test entry and lot disposition | Quality & Supply | Quality & Supply | No release until required evidence is complete; a deviation/exception goes to a case. |
| Catalog and price publication | Business & Systems | Quality supplies scientific content; Business sets commercial fields | Each checks the other’s domain before publication. |
| Customer/organization approval | Business & Systems | Business & Systems | Quality/Operations provide facts; neither silently changes the approval. |
| Payment, refund, and close | Business & Systems | Business & Systems | Operations supplies shipment/return evidence; monthly reconciliation is independently reviewed. |
| Pick, pack, ship, deliver, return | Customer & Fulfillment | Customer & Fulfillment | System enforces released lot, reservation, label history, and carrier evidence. |
| Quality/operational case | Assigned lead | Assigned lead | Business/admin closes only after effectiveness evidence. |
| Deployment and recovery | Business & Systems | Technology seat | Quality or Operations witnesses the staging result and records business acceptance. |

## Operating rules

- Each workflow has one primary owner and a named backup; “everyone” is not an owner.
- The admin account has broad emergency authority for a three-person business. Normal operational work stays with the quality or operations account so the audit history remains meaningful. Every emergency use gets a case/note and next-business-day review.
- No person approves their own evidence when a second role is available. If staffing makes separation impossible, record the conflict, compensating review, and reviewer before closing the control.
- The external business/technology consultant should receive their own named account only if they are one of the three operating members. Otherwise use time-limited, task-specific access and deactivate it at the end of the engagement.
- Review access quarterly and immediately after a role, employment, device, or credential change.

## Names required before activation

Record one person and backup for each role, their company email, whether they are an employee/member or outside consultant, and the effective date. The application’s **Internal → Staff** screen shows the exact enforced matrix. Changes are attributed and terminate live sessions.

References: [ISO quality assurance guidance](https://www.iso.org/quality-management/quality-assurance), [NIST SP 800-53 AC-5 and AC-6](https://csrc.nist.gov/CSRC/media/Projects/risk-management/800-53%20Downloads/800-53r5/SP_800-53_v5_1-derived-OSCAL.pdf), [U.S. GAO Green Book](https://www.gao.gov/greenbook), and [SBA small-business cybersecurity guidance](https://www.sba.gov/business-guide/manage-your-business/strengthen-your-cybersecurity).

