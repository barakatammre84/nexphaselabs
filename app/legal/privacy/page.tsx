import { openCheckoutEnabled } from '@/lib/site-config';
import type { Metadata } from 'next';
import { LegalPage, LegalSection } from '@/components/site/legal-layout';

export const metadata: Metadata = {
  title: 'Privacy policy',
  description:
    'How NexPhase Labs handles information collected through research account requests and orders.',
};

export default function PrivacyPage() {
  return (
    <LegalPage
      title="Privacy policy"
      updated="Pending review"
      intro="This policy describes the information NexPhase Labs collects from organizations and their representatives, why it is collected, and how it is handled."
    >
      {openCheckoutEnabled() && (
        <LegalSection heading="Guest checkout">
          <p>
            Guest checkout collects a contact email and delivery details without
            registering an account or verifying identity. A necessary, private
            browser cookie links your cart and orders to this browser for 30
            days. The cookie is not an advertising tracker. Its expiry does not
            delete order records; the retention section below still applies.
          </p>
        </LegalSection>
      )}
      <LegalSection heading="Website feedback and live support">
        <p>
          The developer-feedback panel records the report type, impact, title,
          message, expected behavior, page, browser user-agent, language,
          timezone, viewport size, time, and any name or email the visitor
          chooses to provide. It does not automatically capture a screenshot or
          the contents of other form fields. A visitor may explicitly attach a
          PNG, JPEG, or WebP screenshot after confirming that they reviewed and
          cropped or redacted passwords, payment details, and personal
          information. If the visitor explicitly chooses “Pick an area” or
          “Highlight text,” the selected element label, a CSS selector,
          position, and visible selected excerpt are attached to that message.
          Up to five selected areas may be attached. A necessary private browser
          cookie reconnects that browser to its report history so staff replies
          can appear in real time. Messages are retained as business
          correspondence and may be searched or summarized through an
          access-controlled internal AI retrieval tool. Customer messages are
          treated as untrusted feedback, not instructions to an automated
          system. Do not include passwords, payment-card information, health
          information, or other sensitive data in a message.
        </p>
      </LegalSection>
      <LegalSection heading="1. Information collected">
        <p>
          When an organization requests a research account we collect the
          organization name, website, business address, tax or registration
          number, a named contact with their role and business email address,
          and a description of the research context for the materials requested.
        </p>
        <p>
          When an order is placed we collect the information needed to fulfil
          and account for it, including shipping, billing, and correspondence
          records.
        </p>
      </LegalSection>

      <LegalSection heading="2. Why it is collected">
        <p>
          Information is collected to verify that an organization qualifies
          under the research-use policy, to fulfil orders, to maintain the
          records a materials supplier is expected to keep, and to respond to
          questions about a lot or an account.
        </p>
      </LegalSection>

      <LegalSection heading="3. Sharing">
        <p>
          Information is not sold. It is shared only with service providers that
          make the business run, such as shipping carriers and payment
          processors, and where disclosure is required by law.
        </p>
      </LegalSection>

      <LegalSection heading="4. Retention">
        <p>
          Account verification and order records are retained for as long as
          needed to operate the account and to meet record-keeping obligations,
          and are then deleted or archived.
        </p>
        <p>
          Feedback conversations are retained while they are useful for customer
          support, product improvement, and business records, then deleted or
          de-identified under the business retention schedule.
        </p>
      </LegalSection>

      <LegalSection heading="5. Security">
        <p>
          Access to account and order records is limited to personnel who need
          it. No system is perfectly secure, and we do not claim otherwise.
        </p>
      </LegalSection>

      <LegalSection heading="6. Your choices">
        <p>
          A named contact may ask what information is held about them, ask for
          corrections, or ask to be removed from correspondence, by writing to
          the address below. Some records must be retained even after an account
          is closed.
        </p>
      </LegalSection>

      <LegalSection heading="7. Contact">
        <p>
          Privacy questions:{' '}
          <span className="font-semibold text-foreground">
            research@nexphaselabs.net
          </span>
        </p>
      </LegalSection>
    </LegalPage>
  );
}
