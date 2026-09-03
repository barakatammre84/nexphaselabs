import type { Metadata } from 'next';
import { LegalPage, LegalSection } from '@/components/site/legal-layout';
import { TERMS_VERSION } from '@/lib/policy';

export const metadata: Metadata = {
  title: 'Shipping policy',
  description: 'How NexPhase Labs ships research materials: eligible addresses, packaging, carriers and tracking.',
};

export default function ShippingPage() {
  return (
    <LegalPage
      title="Shipping policy"
      updated={`Version ${TERMS_VERSION} — pending counsel review`}
      intro="Material ships to verified laboratory and business addresses only, packed for its storage condition, with the lot's analytical documentation in the parcel."
    >
      <LegalSection heading="1. Where we ship">
        <p>
          Orders ship within the United States to the laboratory or business address verified on the account.
          Residential addresses, PO boxes and mailbox services are not accepted for any account type. A change of
          shipping address is made by email to research@nexphaselabs.net and re-verified before use.
        </p>
      </LegalSection>
      <LegalSection heading="2. When we ship">
        <p>
          Material is picked from a released lot after payment is recorded and dispatched within two business days.
          The actual ship date, carrier and tracking number are recorded against the order and emailed to the
          account contact.
        </p>
      </LegalSection>
      <LegalSection heading="3. Packaging and condition">
        <p>
          Each material ships under the condition stated on its catalog page — ambient or on wet ice. Sealed vials
          travel in secondary containment with the certificate of analysis for the lot supplied. The lot number on
          the label matches the lot number on the certificate; report any mismatch on receipt.
        </p>
      </LegalSection>
      <LegalSection heading="4. Carriers and tracking">
        <p>
          Shipments travel by UPS or FedEx with tracking. Title and risk of loss pass on delivery to the address on
          the order. Damage or loss in transit should be reported within two business days of the delivery scan so
          a claim can be opened with the carrier.
        </p>
      </LegalSection>
      <LegalSection heading="5. Contact">
        <p>
          Shipping questions: <span className="font-semibold text-foreground">research@nexphaselabs.net</span>,
          quoting the order number.
        </p>
      </LegalSection>
    </LegalPage>
  );
}
