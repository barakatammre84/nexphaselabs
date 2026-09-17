import type { Metadata } from 'next';
import Link from 'next/link';
import { LegalPage, LegalSection } from '@/components/site/legal-layout';
import { ENTITY } from '@/lib/entity';
import { formatRate, DEFAULT_COMMISSION_BPS, DEFAULT_HOLD_DAYS } from '@/lib/affiliate-rules';
import { AFFILIATE_AGREEMENT_VERSION } from '@/lib/policy';
import { SUPPORT } from '@/lib/support';

export const metadata: Metadata = {
  title: 'Partner agreement',
  description:
    'The terms of the NexPhase Labs partner programme, including what a partner may and may not say about research materials.',
};

/**
 * The partner agreement. Section 3 is the point of the whole document: an approved partner is a
 * third party speaking about regulated material, and the restrictions there are the same ones
 * CLAUDE.md places on this site's own copy. A partner who breaks them is suspended.
 */
export default function AffiliateTermsPage() {
  return (
    <LegalPage
      title="Partner agreement"
      updated={`Version ${AFFILIATE_AGREEMENT_VERSION}`}
      intro="Partners introduce researchers to our catalog and earn a commission on what they buy. In exchange, a partner accepts a narrow and strictly enforced limit on what may be said about the material."
    >
      <LegalSection heading="1. Who may be a partner">
        <p>
          Partners are approved individually. Applying does not make you a partner and does not entitle you to a
          commission. We may decline an application without giving a reason, and we may suspend a partner at any
          time. You must hold a NexPhase Labs account in your own name and be at least 21 years of age.
        </p>
        <p>
          A partner is an independent contractor, not an employee, agent or representative of {ENTITY.legalName}. You
          may not say or imply otherwise, use our name as your own, or speak for us.
        </p>
      </LegalSection>

      <LegalSection heading="2. What you earn">
        <p>
          Commission is {formatRate(DEFAULT_COMMISSION_BPS)} of the materials subtotal of a qualifying order, after any
          promotional discount, unless we have agreed a different rate with you in writing. It is never calculated on
          shipping or on sales tax, because neither is ours to share.
        </p>
        <p>
          An order qualifies when the customer created their account through your link and the order is paid. Commission
          accrues when the order is placed, and vests {DEFAULT_HOLD_DAYS} days after the material is delivered. A refund,
          return or cancellation reverses it, whether or not it had vested. Attribution is recorded once, when the account
          is created, and does not move to another partner afterwards. You never earn on your own orders.
        </p>
      </LegalSection>

      <LegalSection heading="3. What you may not say">
        <p>
          This is the substance of the agreement. Everything we sell is supplied for laboratory research use only. The
          restrictions below apply to every post, message, video, page, caption, email or advertisement in which you
          use your link or name us. They are not stylistic preferences.
        </p>
        <p>You may not, in any medium:</p>
        <ul>
          <li>Name a disease or condition near a product, including framed as research into it.</li>
          <li>
            Claim or suggest an effect on the body: appetite, weight, fat, energy, recovery, sleep, muscle,
            inflammation, healing, repair, skin, hair, mood or cognition, among others.
          </li>
          <li>State or imply a human dose, a route of administration, a schedule, or how to reconstitute anything.</li>
          <li>Describe personal use, show before and after imagery, or publish a testimonial about any effect.</li>
          <li>Name an approved medicine or its brand, or compare our materials to one.</li>
          <li>Refer to human clinical trial outcomes.</li>
          <li>Suggest that a research material is a supplement, a cosmetic, a food, a treatment or safe for people.</li>
        </ul>
        <p>
          You may describe chemical identity, purity and the analytical method, physical form, solubility in laboratory
          solvents, storage and shipping conditions, pack sizes, and the fact that every lot ships with its certificate
          of analysis naming the testing laboratory. If you are unsure whether something is allowed, ask us first at{' '}
          <span className="font-semibold text-foreground">{SUPPORT.email}</span>.
        </p>
      </LegalSection>

      <LegalSection heading="4. Disclosure">
        <p>
          You must disclose that you earn a commission, clearly and near the link itself, in a way a reader cannot
          miss. A disclosure buried in a profile, a bio, a hashtag block or a page footer does not count. This is a
          legal requirement under the Federal Trade Commission&rsquo;s endorsement guides, and it is also ours.
        </p>
      </LegalSection>

      <LegalSection heading="5. How you may promote">
        <p>
          No unsolicited email or messaging, no automated posting, no paid search advertising on our name or domain, no
          coupon or deal listings, no content aimed at anyone under 21, and nothing that misrepresents who you are or
          how the link works. You may not place your link where the surrounding content breaks section 3, including
          content written by somebody else.
        </p>
      </LegalSection>

      <LegalSection heading="6. Payment">
        <p>
          Vested commission is paid by Zelle to the address on your partner record, in batches, once your vested
          balance reaches the published minimum. We must hold a completed Form W-9 from you before the first payment
          is sent. As an independent contractor you are responsible for your own taxes, and we report what we pay you
          as the law requires.
        </p>
        <p>
          We may withhold or reclaim commission on an order we believe was placed to generate it, on an account you
          control, or where section 3 or section 5 was broken.
        </p>
      </LegalSection>

      <LegalSection heading="7. Ending the arrangement">
        <p>
          Either of us may end this arrangement at any time, for any reason. On suspension your link stops earning
          immediately. Commission already vested and not connected to a breach is still paid. We may publish a
          corrected version of this agreement; a new version has to be accepted before your link continues to earn.
        </p>
      </LegalSection>

      <LegalSection heading="8. The rest">
        <p>
          This agreement is governed by the law of the State of California. It sits alongside our{' '}
          <Link href="/legal/terms" className="font-semibold text-primary">terms of sale</Link>,{' '}
          <Link href="/legal/research-use" className="font-semibold text-primary">research-use policy</Link> and{' '}
          <Link href="/legal/privacy" className="font-semibold text-primary">privacy policy</Link>. Nothing here grants
          you any right in our name, marks or content beyond linking to us as described above.
        </p>
      </LegalSection>
    </LegalPage>
  );
}
