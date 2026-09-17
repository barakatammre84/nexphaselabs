import type { Metadata } from 'next';
import { LegalPage, LegalSection } from '@/components/site/legal-layout';
import { ENTITY } from '@/lib/entity';
import { MINIMUM_AGE, PRIVACY_VERSION } from '@/lib/policy';
import { SUPPORT } from '@/lib/support';
import { webAnalyticsToken } from '@/lib/site-config';

export const metadata: Metadata = {
  title: 'Privacy policy',
  description: 'What NexPhase Labs collects when you browse, create an account or order, why, and how long it is kept.',
};

export default function PrivacyPage() {
  return (
    <LegalPage
      title="Privacy policy"
      updated={`Version ${PRIVACY_VERSION}`}
      intro="We collect what is needed to supply research material, keep the records a supplier has to keep, and answer your questions — and nothing else. We do not sell information about you."
    >
      <LegalSection heading="1. Who is responsible">
        <p>
          The site is operated by {ENTITY.legalName}, doing business as {ENTITY.dbaName}, Oakland, California. Questions
          about this policy go to <span className="font-semibold text-foreground">{SUPPORT.email}</span>.
        </p>
      </LegalSection>

      <LegalSection heading="2. What we collect">
        <p>
          When you browse: the pages you request, your IP address and browser details, in the ordinary server logs
          of our hosting provider, and the cookies described in section 5.
        </p>
        <p>
          When you create an account: your name, email address, a password we store only as a one-way hash, the
          research setting you select, and the time and version of each confirmation you give — the age statement,
          the research-use acknowledgement and the terms of sale.
        </p>
        <p>
          When you order, with or without an account: your shipping and billing details, what you ordered, the
          confirmations you gave at checkout, the address the order was placed from, and the correspondence about
          the order. For Zelle, we keep the order reference, amount, the payer name you choose to report, the time of
          your payment claim, and limited payment-confirmation details needed to match the Chase receipt. We do not
          receive your bank login or bank account number. For other payment providers, we keep only the provider
          reference and settlement status needed to manage the order.
        </p>
        <p>
          When you write to us: your message, the details you choose to give, and the page you wrote from. The site
          feedback panel is described in section 7.
        </p>
      </LegalSection>

      <LegalSection heading="3. Why we collect it">
        <p>
          To take, fulfil, ship and account for orders; to record that each order was placed under the research-use
          policy; to keep lot and shipment records that let us trace which lot went to which order; to answer
          questions about an order, a lot or an account; to detect and refuse misuse; and to meet tax and
          record-keeping obligations.
        </p>
      </LegalSection>

      <LegalSection heading="4. Who we share it with">
        <p>
          Information is shared only with providers that make the business run: shipping carriers (name and
          address), payment processors (order amount and the details they need to take payment), the email service
          that sends order and account messages, and the cloud provider that hosts the site and its database. Each
          receives only what it needs. We disclose information where the law requires it, and to an independent
          laboratory or regulator investigating a quality concern about a lot, where that is needed. We do not sell,
          rent or trade personal information, and we do not share it for advertising.
        </p>
      </LegalSection>

      <LegalSection heading="5. Cookies">
        <p>
          The site sets only cookies it needs to work: one that remembers you accepted the entry notice (180 days,
          holds no personal information), one that keeps you signed in to your account, one that links a guest cart
          and its orders to your browser for 30 days, and one that reconnects the feedback panel to its history.
          {webAnalyticsToken()
            ? 'None of them is an advertising tracker. The only measurement script is Cloudflare Web Analytics, from the provider that hosts the site: it counts page views without cookies, fingerprinting or cross-site tracking. We run no advertising scripts.'
            : 'None of them is an advertising tracker, and we do not run third-party analytics or advertising scripts.'}
        </p>
      </LegalSection>

      <LegalSection heading="6. How long we keep it">
        <p>
          Order, shipment, lot-traceability and payment records are kept for seven years from the order, which is
          what tax and product-traceability obligations require. Account records are kept while the account is open
          and for the same period afterwards where they relate to an order. Correspondence is kept while it is
          useful for support and quality records, then deleted or de-identified. Server logs are kept for a short,
          rolling period by the hosting provider.
        </p>
      </LegalSection>

      <LegalSection heading="7. The feedback panel">
        <p>
          The site feedback panel records the report type, impact, title, message, expected behavior, page, browser
          user-agent, language, timezone, viewport size, time, and any name or email you choose to give. It does not
          capture a screenshot or the contents of other form fields on its own. You may attach a PNG, JPEG or WebP
          screenshot after confirming you have removed passwords, payment details and personal information from it.
          If you use &ldquo;Pick an area&rdquo; or &ldquo;Highlight text&rdquo;, the selected element, its position
          and the visible excerpt are attached to that message. Messages are kept as business correspondence and may
          be searched or summarized by an access-controlled internal tool. Do not include passwords, card numbers or
          health information in a message.
        </p>
      </LegalSection>

      <LegalSection heading="8. Security">
        <p>
          Records are held in an access-controlled database; staff access is limited to the people who need it and
          is logged. Passwords are stored as salted hashes. No system is perfectly secure, and we do not claim
          otherwise; if we learn of a breach affecting your information we will tell you as the law requires.
        </p>
      </LegalSection>

      <LegalSection heading="9. Your choices and rights">
        <p>
          You can see and change your account details on the account page. You can ask us what information we hold
          about you, ask for it to be corrected or deleted, or ask us to stop writing to you, by emailing{' '}
          {SUPPORT.email}. We will confirm who you are before acting, and some records — orders, shipments and
          payments — must be kept for the period in section 6 even after an account is closed.
        </p>
        <p>
          California residents have the right to know what personal information we collect, use and disclose, to
          request its deletion, to correct it, and not to be discriminated against for exercising those rights. We
          do not sell or share personal information as those terms are defined in California law, so there is
          nothing to opt out of. Requests go to the address above and are answered within 45 days.
        </p>
      </LegalSection>

      <LegalSection heading="10. Age">
        <p>
          This site is for researchers aged {MINIMUM_AGE} and over. We do not knowingly collect information from
          anyone under {MINIMUM_AGE}, and we close any account and delete any order found to have been placed by
          someone younger.
        </p>
      </LegalSection>

      <LegalSection heading="11. Changes">
        <p>
          When this policy changes, the version at the top of the page changes with it. A change that affects how we
          use information we already hold is announced to account holders by email before it takes effect.
        </p>
      </LegalSection>
    </LegalPage>
  );
}
