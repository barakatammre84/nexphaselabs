import type { Metadata } from 'next';
import { LegalPage, LegalSection } from '@/components/site/legal-layout';
import { RUO_ACKNOWLEDGEMENT, RUO_VERSION, TERMS_VERSION } from '@/lib/policy';

export const metadata: Metadata = {
  title: 'Terms of sale',
  description: 'Terms of sale and research-use policy for NexPhase Labs research materials.',
};

export default function TermsPage() {
  return (
    <LegalPage
      title="Terms of sale"
      updated={`Version ${TERMS_VERSION} — pending counsel review`}
      intro="These terms govern the supply of research materials by NexPhase Labs to approved organizations. Opening an account or placing an order means the organization accepts them."
    >
      <LegalSection id="research-use" heading="1. Research-use policy">
        <p>
          All materials supplied by NexPhase Labs are for laboratory research use only. They are not drugs,
          medicines, dietary supplements, cosmetics, food, or consumer products. They are not for human or
          veterinary use, not for clinical or diagnostic procedures, and not for consumption.
        </p>
        <p>
          The purchasing organization confirms that no material supplied will be administered to a human or an
          animal, incorporated into any product intended for human or animal use, or resold to consumers. Breach of
          this section is grounds for immediate closure of the account.
        </p>
        <p>
          NexPhase Labs does not provide dosing guidance, administration protocols, or medical advice of any kind,
          and no request for such guidance will be answered.
        </p>
        <p className="border-l-2 border-primary bg-secondary px-4 py-3 text-foreground">
          <span className="block font-mono text-[11px] uppercase tracking-[0.1em] text-muted-foreground">
            Research-use acknowledgement, version {RUO_VERSION}
          </span>
          <span className="mt-2 block">{RUO_ACKNOWLEDGEMENT}</span>
        </p>
        <p>
          Every account records the version of this acknowledgement and of these terms that it accepted, and when.
          If either changes, the account must accept the new version before pricing or ordering is available.
        </p>
      </LegalSection>

      <LegalSection heading="2. Eligibility and account review">
        <p>
          Accounts are opened for organizations that qualify under the research access criteria published on this
          site and, only where NexPhase Labs has enabled it, for individual researchers who have confirmed the
          research-use acknowledgement. NexPhase Labs may request additional verification, and may decline or close
          any account at its discretion.
        </p>
        <p>
          Orders are shipped to verified laboratory or business addresses only. Residential shipping addresses are
          not accepted for any account type.
        </p>
      </LegalSection>

      <LegalSection heading="3. Specifications and documentation">
        <p>
          Catalog specifications describe the material generally. Lot-specific properties, including purity, are
          reported on the certificate of analysis issued for the lot supplied, which governs in the event of any
          inconsistency with catalog copy.
        </p>
        <p>
          The purchasing organization is responsible for confirming, on receipt, that the material and its
          documentation match the order, and for reporting any discrepancy before the material is used.
        </p>
      </LegalSection>

      <LegalSection heading="4. Pricing, orders, and payment">
        <p>
          Pricing and availability are provided to verified accounts and may change without notice. An order is
          accepted only when confirmed in writing by NexPhase Labs. Payment terms are stated on the order
          confirmation.
        </p>
      </LegalSection>

      <LegalSection heading="5. Shipping, title, and risk">
        <p>
          Shipping methods and packaging are selected to suit the material. Title and risk of loss pass to the
          purchasing organization on delivery to the address stated on the order.
        </p>
      </LegalSection>

      <LegalSection heading="6. Returns">
        <p>
          Because storage conditions cannot be verified once material has left our control, returns are accepted
          only where the material supplied does not match the order or its documentation, and only when reported
          promptly on receipt.
        </p>
      </LegalSection>

      <LegalSection heading="7. Handling, compliance, and responsibility">
        <p>
          The purchasing organization is solely responsible for the safe handling, storage, use, and disposal of all
          material received, for the competence and supervision of the personnel who handle it, and for compliance
          with all applicable federal, state, and local law and institutional policy.
        </p>
      </LegalSection>

      <LegalSection heading="8. No warranty beyond specification">
        <p>
          Material is supplied as described on the certificate of analysis for its lot. To the fullest extent
          permitted by law, no other warranty, express or implied, is given, including any warranty of
          merchantability or fitness for a particular purpose.
        </p>
      </LegalSection>

      <LegalSection heading="9. Limitation of liability">
        <p>
          To the fullest extent permitted by law, NexPhase Labs is not liable for indirect, incidental, or
          consequential loss, and total liability arising from any order is limited to the amount paid for the
          material giving rise to the claim.
        </p>
      </LegalSection>

      <LegalSection heading="10. Governing law">
        <p>
          These terms are governed by the laws of the state in which NexPhase Labs is organized, without regard to
          conflict of law principles.
        </p>
      </LegalSection>

      <LegalSection heading="11. Contact">
        <p>
          Questions about these terms: <span className="font-semibold text-foreground">research@nexphaselabs.net</span>
        </p>
      </LegalSection>
    </LegalPage>
  );
}
