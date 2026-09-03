import type { Metadata } from 'next';
import { LegalPage, LegalSection } from '@/components/site/legal-layout';
import { TERMS_VERSION } from '@/lib/policy';

export const metadata: Metadata = {
  title: 'Returns policy',
  description: 'When NexPhase Labs accepts a return of research material, and how to report a discrepancy.',
};

export default function ReturnsPage() {
  return (
    <LegalPage
      title="Returns policy"
      updated={`Version ${TERMS_VERSION} — pending counsel review`}
      intro="Because storage conditions cannot be verified once material has left our control, returns are limited to material that does not match its order or its documentation."
    >
      <LegalSection heading="1. What can be returned">
        <p>
          A return is accepted when the material supplied does not match the order — wrong material, wrong pack
          size, wrong lot against the certificate — or when the documentation issued with it does not describe the
          lot supplied. Returns for any other reason are not accepted.
        </p>
      </LegalSection>
      <LegalSection heading="2. How to report a discrepancy">
        <p>
          Report the discrepancy within five business days of delivery to research@nexphaselabs.net with the order
          number, lot number and a description or photograph of the label. We confirm the lot record and arrange
          collection or replacement; do not ship material back without that confirmation.
        </p>
      </LegalSection>
      <LegalSection heading="3. Condition">
        <p>
          Returned material must be unopened, in its original sealed container, and have been kept at the storage
          condition stated on the catalog page. Material that has been opened, reconstituted or stored outside its
          condition cannot be returned.
        </p>
      </LegalSection>
      <LegalSection heading="4. Refunds and replacements">
        <p>
          Where a discrepancy is confirmed, we replace the material from a released lot or refund the line to the
          originating payment account. Refunds are recorded against the order and confirmed by email.
        </p>
      </LegalSection>
      <LegalSection heading="5. Cancellations">
        <p>
          An order can be cancelled from the account page at any time before payment is recorded. After payment,
          cancellation is by email and is accepted until the shipment has been recorded.
        </p>
      </LegalSection>
    </LegalPage>
  );
}
