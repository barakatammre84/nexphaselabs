import type { Metadata } from 'next';
import { LegalPage, LegalSection } from '@/components/site/legal-layout';
import { RETURNS_VERSION } from '@/lib/policy';

export const metadata: Metadata = {
  title: 'Returns & refunds',
  description: 'How to return unopened research material within 30 days, and how refunds are paid.',
};

export default function ReturnsPage() {
  return (
    <LegalPage
      title="Returns & refunds"
      updated={`Version ${RETURNS_VERSION}`}
      intro="Unopened, sealed material can be returned within 30 days of delivery. Because we cannot verify how material was stored once it left our control, nothing that comes back is ever resold."
    >
      <LegalSection heading="1. What can be returned">
        <p>
          A material can be returned when all of the following are true: the request is made within 30 days of the
          delivery scan; the vial or container is unopened, with its seal intact and its label legible; and it has
          been kept at the storage condition shown on its catalog page and packing slip since delivery. Material that
          has been opened, reconstituted, relabeled, frozen and thawed, or kept outside its storage condition cannot
          be returned. Special orders and quantities made to order cannot be returned.
        </p>
      </LegalSection>

      <LegalSection heading="2. Damaged, wrong or missing items">
        <p>
          If an order arrives damaged, if a line is missing, or if the material or lot does not match the order or
          the certificate, tell us within 48 hours of the delivery scan. Write to research@nexphaselabs.net with the
          order number, the lot number on the label, and photographs of the parcel, the packing and the label. We
          check the lot record and either replace the line from a released lot or refund it. We cover the shipping on
          replacements where the error is ours, and we do not ask you to return damaged material unless the carrier
          claim needs it.
        </p>
      </LegalSection>

      <LegalSection heading="3. How to return something">
        <p>
          Do not ship anything back without a return authorization. Email research@nexphaselabs.net with the order
          number and the lines you want to return. We reply with a return authorization number and the return
          address; the authorization is valid for 14 days. Pack the sealed vials in their original secondary
          packaging, write the authorization number on the outside of the parcel, and send it with tracking. You pay
          the return shipping unless the return is the result of our error.
        </p>
      </LegalSection>

      <LegalSection heading="4. Refunds">
        <p>
          When the parcel arrives we inspect the seals and labels against the return authorization. An accepted
          return is refunded to the payment method used for the order, less the original shipping charge, within
          five to seven business days of that inspection; your bank or card issuer may take a few more days to show
          it. If a returned item fails inspection we tell you why, and it is not refunded or sent back. A refund is
          recorded against the order and confirmed by email.
        </p>
      </LegalSection>

      <LegalSection heading="5. Returned material is not restocked">
        <p>
          Every returned vial is quarantined and destroyed under our disposal procedure. We never restock, resell or
          re-ship a returned item, whatever its condition on arrival.
        </p>
      </LegalSection>

      <LegalSection heading="6. Cancellations and refused orders">
        <p>
          An order can be cancelled from the account page at any time before payment is recorded. After payment,
          cancellation is by email and is accepted until the shipment has been recorded; after that, the returns
          process above applies. An order we decline under the research-use policy is refunded in full.
        </p>
      </LegalSection>

      <LegalSection heading="7. Contact">
        <p>
          Returns and refunds: <span className="font-semibold text-foreground">research@nexphaselabs.net</span>,
          quoting the order number.
        </p>
      </LegalSection>
    </LegalPage>
  );
}
