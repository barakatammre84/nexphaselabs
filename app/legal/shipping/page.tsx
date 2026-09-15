import type { Metadata } from 'next';
import { LegalPage, LegalSection } from '@/components/site/legal-layout';
import { SHIPPING_CUTOFF, SHIPPING_VERSION } from '@/lib/policy';
import { SUPPORT } from '@/lib/support';

export const metadata: Metadata = {
  title: 'Shipping policy',
  description:
    'Where and how NexPhase Labs ships research materials: US addresses, cut-off times, carriers, packaging and tracking.',
};

export default function ShippingPage() {
  return (
    <LegalPage
      title="Shipping policy"
      updated={`Version ${SHIPPING_VERSION}`}
      intro="Orders ship within the United States, packed for the material's storage condition, with the lot's certificate of analysis in the parcel and tracking sent to you by email."
    >
      <LegalSection heading="1. Where we ship">
        <p>
          We ship to street addresses in the United States, including residential addresses. We do not ship to PO
          boxes, mailbox services, freight forwarders or addresses outside the United States, because temperature
          packaging and carrier signature options need a physical delivery point. Check your address carefully at
          checkout: a parcel returned or lost because of an address error is re-shipped at your cost, and a parcel
          delivered to an address you gave in error cannot be recovered by us.
        </p>
      </LegalSection>

      <LegalSection heading="2. When we ship">
        <p>
          Material is picked from a released lot once payment has been recorded. Orders paid before{' '}
          {SHIPPING_CUTOFF} on a business day ship the same day; orders paid after the cut-off, or on a weekend or
          US federal holiday, ship the next business day. Temperature-sensitive material may be held to the next
          business day when a weekend or holiday would otherwise leave it in transit. The ship date, carrier and
          tracking number are recorded against the order and emailed to you.
        </p>
      </LegalSection>

      <LegalSection heading="3. Packaging and storage condition">
        <p>
          Each material ships under the condition stated on its catalog page — ambient, or cold with ice packs in an
          insulated shipper. Sealed vials travel in secondary containment with the certificate of analysis for the
          lot supplied and a packing slip that carries the research-use statement. The lot number on the label
          matches the lot number on the certificate; report any mismatch on receipt. On arrival, move the material
          to its storage condition straight away.
        </p>
      </LegalSection>

      <LegalSection heading="4. Carriers, cost and tracking">
        <p>
          Shipments travel by USPS with tracking. Shipping options and their cost are shown at checkout before
          you pay, and depend on the service, the destination and whether cold packaging is needed. We may choose
          a different USPS service than the one shown if it gets the material there in better condition, at no
          extra charge to you.
        </p>
      </LegalSection>

      <LegalSection heading="5. Delivery, loss and damage">
        <p>
          Title and risk of loss pass to you when the carrier records delivery to the address on the order. If a
          parcel is marked delivered but has not arrived, check with household members, neighbors, a building
          office and the carrier first, then tell us within 48 hours so we can open a trace or a claim; we cannot
          accept responsibility for a parcel stolen after a confirmed delivery. Damage in transit, a missing line or
          a wrong item should be reported within 48 hours of the delivery scan with photographs, as set out in the
          returns and refunds policy.
        </p>
      </LegalSection>

      <LegalSection heading="6. Contact">
        <p>
          Shipping questions: <span className="font-semibold text-foreground">{SUPPORT.email}</span>, quoting the
          order number. Order and shipping questions received during our hours are answered{' '}
          {SUPPORT.orderReply}.
        </p>
      </LegalSection>
    </LegalPage>
  );
}
