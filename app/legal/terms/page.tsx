import type { Metadata } from 'next';
import Link from 'next/link';
import { LegalPage, LegalSection } from '@/components/site/legal-layout';
import { ENTITY } from '@/lib/entity';
import { AGE_STATEMENT, MINIMUM_AGE, RUO_ACKNOWLEDGEMENT, RUO_VERSION, TERMS_VERSION } from '@/lib/policy';

export const metadata: Metadata = {
  title: 'Terms of sale',
  description: 'The terms that apply to every order of research material from NexPhase Labs.',
};

export default function TermsPage() {
  return (
    <LegalPage
      title="Terms of sale"
      updated={`Version ${TERMS_VERSION}`}
      intro="These terms apply to this website and to every order placed on it. Creating an account or placing an order means you have read them and agree to them."
    >
      <LegalSection id="who" heading="1. Who we are and what these terms cover">
        <p>
          {ENTITY.tradingName} is the trading name of {ENTITY.legalName}, a California limited liability company based
          in Oakland, California (&ldquo;NexPhase Labs&rdquo;, &ldquo;we&rdquo;, &ldquo;us&rdquo;). These terms, together
          with the{' '}
          <Link href="/legal/research-use" className="font-semibold text-primary">
            research-use policy
          </Link>
          , the{' '}
          <Link href="/legal/shipping" className="font-semibold text-primary">
            shipping policy
          </Link>
          , the{' '}
          <Link href="/legal/returns" className="font-semibold text-primary">
            returns and refunds policy
          </Link>{' '}
          and the{' '}
          <Link href="/legal/privacy" className="font-semibold text-primary">
            privacy policy
          </Link>
          , are the whole agreement between you and us for the use of this site and the supply of research
          materials. If you do not agree with them, do not use the site or place an order.
        </p>
      </LegalSection>

      <LegalSection id="research-use" heading="2. Research use only">
        <p>
          Every material we supply is sold strictly for in vitro laboratory research. Our materials are not drugs,
          medicines, dietary supplements, cosmetics, food or consumer products. They are not for human or veterinary
          use, not for clinical or diagnostic procedures, and not for consumption in any form. Nothing on this site is
          a claim that any material treats, prevents or diagnoses any condition, and no statement here has been
          evaluated by the Food and Drug Administration.
        </p>
        <p>
          You agree that no material supplied will be administered to a human or an animal, incorporated into any
          product intended for human or animal use, or resold to consumers.
        </p>
      </LegalSection>

      <LegalSection id="qualified" heading="3. Who may buy">
        <p>
          You may create an account and order only if all of the following are true: you are at least {MINIMUM_AGE}{' '}
          years of age; you are buying for laboratory research, whether independently or for an organization; and you
          have the training, equipment and facilities to receive, store and handle research materials safely. We may
          ask for evidence of any of these before or after accepting an order, and we may decline an order or close an
          account without giving a reason.
        </p>
      </LegalSection>

      <LegalSection id="acknowledgement" heading="4. Your acknowledgement">
        <p>
          The statements below are shown and must be confirmed when an account is created and again at every
          checkout. The version confirmed, and when, is recorded against the account and against each order.
        </p>
        <p className="border-l-2 border-primary bg-secondary px-4 py-3 text-foreground">
          <span className="block font-mono text-[11px] uppercase tracking-[0.1em] text-muted-foreground">
            Research-use acknowledgement, version {RUO_VERSION}
          </span>
          <span className="mt-2 block">{RUO_ACKNOWLEDGEMENT}</span>
          <span className="mt-3 block font-semibold">{AGE_STATEMENT}</span>
        </p>
        <p>
          If either the acknowledgement or these terms change, an account must confirm the new version before pricing
          or ordering is available again.
        </p>
      </LegalSection>

      <LegalSection id="no-guidance" heading="5. No dosing, administration or medical guidance">
        <p>
          We do not provide, and will not answer questions about, dosing, reconstitution for administration,
          injection or any other route of administration, cycles, stacking, effects in people or animals, or any
          medical matter. Product pages describe the material, its specification and its storage. A question that
          indicates any use other than laboratory research is declined, and repeated questions of that kind end our
          service to you.
        </p>
      </LegalSection>

      <LegalSection id="responsibility" heading="6. Your responsibilities">
        <p>
          You are solely responsible for the safe receipt, storage, handling, use and disposal of every material you
          order; for the competence and supervision of anyone who handles it; and for complying with all federal,
          state, local and institutional rules that apply to you. You will indemnify and hold harmless NexPhase Labs,
          {ENTITY.legalName} and their members, staff and agents against any claim, loss or cost arising from your use
          of a material, from any use contrary to these terms, or from any statement you made to us that was untrue.
        </p>
      </LegalSection>

      <LegalSection id="documentation" heading="7. Specifications and documentation">
        <p>
          Catalog pages describe a material generally. The properties of the lot you receive, including purity, are
          reported on the certificate of analysis for that lot, which governs if it differs from catalog copy. Every
          lot we sell has been tested by an independent laboratory and is only released for sale once its results
          have been reviewed. The certificate that ships with an order is pinned to that order and can be opened from
          the order page at any time.
        </p>
        <p>
          Check the material and its documentation against your order when it arrives, and report any discrepancy
          before the material is used.
        </p>
      </LegalSection>

      <LegalSection id="orders" heading="8. Prices, orders and payment">
        <p>
          Prices are shown in the catalog in US dollars and confirmed at checkout; they do not include shipping,
          which is shown before you pay. A price shown in error can be corrected before an order is accepted. An
          order is accepted when we confirm it; until then we may decline it and refund any payment taken.
        </p>
        <p>
          Payment methods are shown at checkout. If you have a question about a charge, contact us before contacting
          your bank; a chargeback raised on an order that was delivered as described will be contested with the order
          record, and an account that raises one may be closed.
        </p>
        <p>
          For Zelle orders, send only the exact total to the enrolled recipient shown at checkout and include the
          order number as the memo. A customer report that payment was sent does not make the order paid. We prepare
          the order only after the payment is matched to the Chase receipt. Zelle payments are generally final and do
          not include purchase protection.
        </p>
      </LegalSection>

      <LegalSection id="shipping" heading="9. Shipping, title and risk">
        <p>
          We ship within the United States as described in the{' '}
          <Link href="/legal/shipping" className="font-semibold text-primary">
            shipping policy
          </Link>
          . Title and risk of loss pass to you when the carrier records delivery to the address on the order.
        </p>
      </LegalSection>

      <LegalSection id="returns" heading="10. Returns and refunds">
        <p>
          Unopened, sealed material may be returned within 30 days of delivery as described in the{' '}
          <Link href="/legal/returns" className="font-semibold text-primary">
            returns and refunds policy
          </Link>
          . Returned material is never restocked.
        </p>
      </LegalSection>

      <LegalSection id="monitoring" heading="11. Review, refusal and closure">
        <p>
          We review orders and correspondence for signs of use outside laboratory research. We may cancel an order,
          refuse future orders, close an account and decline to deal with a person or address at any time. A refused
          order is refunded in full to the payment method used. Attempts to open a new account after closure are
          themselves grounds for refusal.
        </p>
      </LegalSection>

      <LegalSection id="regulatory" heading="12. Regulatory status">
        <p>
          The materials we sell are research chemicals labeled for research use only. They have not been approved by
          the Food and Drug Administration or any other regulator for any use, and we make no representation that they
          are suitable for any purpose other than laboratory research. Where a material is subject to additional
          restriction in your state, it is your responsibility to know that before ordering.
        </p>
      </LegalSection>

      <LegalSection id="ip" heading="13. Content and intellectual property">
        <p>
          The text, documentation, images and design of this site belong to {ENTITY.legalName} or its licensors. You
          may print or save pages for your own research records; you may not reproduce the site or its documentation
          for any other purpose without written permission. Certificates of analysis may be shared with the people
          who use the material in your laboratory.
        </p>
      </LegalSection>

      <LegalSection id="warranty" heading="14. Warranty and limitation of liability">
        <p>
          Material is supplied as described on the certificate of analysis for its lot. To the fullest extent
          permitted by law, no other warranty, express or implied, is given, including any warranty of merchantability
          or fitness for a particular purpose. To the fullest extent permitted by law, NexPhase Labs is not liable for
          indirect, incidental, special or consequential loss, and our total liability arising from any order is
          limited to the amount paid for the material giving rise to the claim.
        </p>
      </LegalSection>

      <LegalSection id="law" heading="15. Governing law and disputes">
        <p>
          These terms are governed by the laws of the State of California, without regard to its conflict of law
          rules. Any dispute that cannot be resolved by writing to us first will be brought in the state or federal
          courts located in Alameda County, California, and you consent to their jurisdiction.
        </p>
      </LegalSection>

      <LegalSection id="changes" heading="16. Changes and contact">
        <p>
          We may update these terms. The version number at the top of this page changes when we do, and accounts are
          asked to confirm the new version before ordering again. Questions about these terms:{' '}
          <span className="font-semibold text-foreground">research@nexphaselabs.net</span>.
        </p>
      </LegalSection>
    </LegalPage>
  );
}
