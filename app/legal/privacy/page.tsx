import type { Metadata } from 'next';
import { LegalPage, LegalSection } from '@/components/site/legal-layout';

export const metadata: Metadata = {
  title: 'Privacy policy',
  description: 'How NexPhase Labs handles information collected through research account requests and orders.',
};

export default function PrivacyPage() {
  return (
    <LegalPage
      title="Privacy policy"
      updated="Pending review"
      intro="This policy describes the information NexPhase Labs collects from organizations and their representatives, why it is collected, and how it is handled."
    >
      <LegalSection heading="1. Information collected">
        <p>
          When an organization requests a research account we collect the organization name, website, business
          address, tax or registration number, a named contact with their role and business email address, and a
          description of the research context for the materials requested.
        </p>
        <p>
          When an order is placed we collect the information needed to fulfil and account for it, including
          shipping, billing, and correspondence records.
        </p>
      </LegalSection>

      <LegalSection heading="2. Why it is collected">
        <p>
          Information is collected to verify that an organization qualifies under the research-use policy, to
          fulfil orders, to maintain the records a materials supplier is expected to keep, and to respond to
          questions about a lot or an account.
        </p>
      </LegalSection>

      <LegalSection heading="3. Sharing">
        <p>
          Information is not sold. It is shared only with service providers that make the business run, such as
          shipping carriers and payment processors, and where disclosure is required by law.
        </p>
      </LegalSection>

      <LegalSection heading="4. Retention">
        <p>
          Account verification and order records are retained for as long as needed to operate the account and to
          meet record-keeping obligations, and are then deleted or archived.
        </p>
      </LegalSection>

      <LegalSection heading="5. Security">
        <p>
          Access to account and order records is limited to personnel who need it. No system is perfectly secure,
          and we do not claim otherwise.
        </p>
      </LegalSection>

      <LegalSection heading="6. Your choices">
        <p>
          A named contact may ask what information is held about them, ask for corrections, or ask to be removed
          from correspondence, by writing to the address below. Some records must be retained even after an account
          is closed.
        </p>
      </LegalSection>

      <LegalSection heading="7. Contact">
        <p>
          Privacy questions: <span className="font-semibold text-foreground">research@nexphaselabs.net</span>
        </p>
      </LegalSection>
    </LegalPage>
  );
}
