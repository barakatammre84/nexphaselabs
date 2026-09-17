import type { Metadata } from 'next';
import Link from 'next/link';
import { LegalPage, LegalSection } from '@/components/site/legal-layout';
import { ENTITY } from '@/lib/entity';
import { COMMUNITY_GUIDELINES_VERSION, MINIMUM_AGE } from '@/lib/policy';
import { SUPPORT } from '@/lib/support';

export const metadata: Metadata = {
  title: 'Community guidelines',
  description:
    'What may and may not be said about NexPhase Labs materials, anywhere our name or a partner link appears, and how we act when the line is crossed.',
};

/**
 * Community guidelines (owner, 16 Sep 2026).
 *
 * The claim rules in CLAUDE.md govern what this site says. This page extends the same rules to
 * everyone else who talks about the material using our name: customers, reviewers, forum posters
 * and approved partners. It is a compliance control and it is deliberately public, because a
 * published standard we act on is evidence of intent in a way a disclaimer is not.
 */
export default function CommunityGuidelinesPage() {
  return (
    <LegalPage
      title="Community guidelines"
      updated={`Version ${COMMUNITY_GUIDELINES_VERSION}`}
      intro="Our materials are supplied for laboratory research. These guidelines say what may and may not be said about them wherever our name appears, and what we do when the line is crossed. We enforce them."
    >
      <LegalSection heading="1. Where these apply">
        <p>
          To anything said to us or about us: support conversations, the feedback panel, reviews,
          social posts, videos, forums, newsletters and any page carrying a partner link to this
          site. They apply to customers, to approved partners, and to anyone else invoking the name{' '}
          {ENTITY.tradingName} or {ENTITY.legalName}.
        </p>
      </LegalSection>

      <LegalSection heading="2. What belongs here">
        <ul>
          <li>Chemical identity, purity and the analytical method used to measure it.</li>
          <li>Questions about a certificate of analysis, a lot number or a testing laboratory&rsquo;s reference.</li>
          <li>Solubility in laboratory solvents, storage, stability and shipping condition.</li>
          <li>Published in vitro pharmacology with a named target and a measured constant, cited to primary literature.</li>
          <li>Questions about ordering, documentation, shipping, returns or our policies.</li>
        </ul>
      </LegalSection>

      <LegalSection heading="3. What is not allowed">
        <p>
          None of the following is permitted, in any medium, whether phrased as fact, as experience,
          as a question or as a joke:
        </p>
        <ul>
          <li>Any account of a person or an animal taking, applying or being given one of these materials.</li>
          <li>A dose, a route, a schedule, a reconstitution volume, or a calculation converting any of those.</li>
          <li>A claim that a material treats, prevents, diagnoses, cures or improves any disease or condition.</li>
          <li>
            A claim about an effect on the body: appetite, weight, fat, energy, recovery, sleep, muscle,
            inflammation, healing, repair, skin, hair, mood or cognition, among others.
          </li>
          <li>Stacking, cycling or protocol content, and before-and-after imagery of any kind.</li>
          <li>Naming an approved medicine, or comparing a research material to one.</li>
          <li>Presenting a material as a supplement, cosmetic, food, or anything safe for people.</li>
          <li>Harassment, misrepresentation, spam, or anything unlawful.</li>
        </ul>
        <p>
          To be concrete, each of these would be removed: an account of injecting a material and what
          followed; a question asking how much to use per kilogram of body weight; a statement that a
          material helped with a named condition.
        </p>
        <p>
          If you ask us a question of this kind we will decline it rather than answer it. {SUPPORT.outOfScope}
        </p>
      </LegalSection>

      <LegalSection heading="4. Partners, and anyone claiming to speak for us">
        <p>
          We do run a partner programme, and approved partners earn a commission on orders from
          researchers they introduce. Every partner is approved individually, is bound by the{' '}
          <Link href="/legal/affiliate-terms" className="font-semibold text-primary">partner agreement</Link>,
          and must disclose clearly and near the link that they earn a commission. Section 3 above binds
          them exactly as it binds everyone else, and breaking it ends the arrangement.
        </p>
        <p>
          Nobody else speaks for us. We do not pay for reviews, we do not place content with creators
          outside that programme, and we do not ask anyone to describe what a material did for them.
          Any suggestion that we endorse an account of human use is false, and we would like to know
          about it.
        </p>
      </LegalSection>

      <LegalSection heading="5. What we do about a violation">
        <p>
          In this order, and we do not always start at the beginning: we remove or hide the content
          where it is ours to moderate; we ask the platform or the author to remove it where it is not;
          we restrict, suspend or close the account; we end a partner arrangement and withhold
          commission connected to the breach; and where the content suggests harm to a person, or
          unlawful activity, we report it.
        </p>
        <p>
          We may also refuse or cancel an order, and refund it, where the surrounding conversation
          indicates the material is not going to a laboratory. That decision is ours and we do not
          negotiate it.
        </p>
      </LegalSection>

      <LegalSection heading="6. Reporting something">
        <p>
          Send it to <span className="font-semibold text-foreground">{SUPPORT.email}</span> with a link
          or a screenshot. This includes content that misuses our name, misstates what a material is,
          or claims an affiliation that does not exist. A person reads every report,{' '}
          {SUPPORT.firstReply}.
        </p>
        <p>
          You must be at least {MINIMUM_AGE} to hold an account or to take part in any of the above.
        </p>
      </LegalSection>
    </LegalPage>
  );
}
