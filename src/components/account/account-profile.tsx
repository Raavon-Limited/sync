/**
 * The two things every account has: an ID card, and the details it is made of.
 *
 * WHY THEY ARE THE PROFILE PAGE AND NOT SETTINGS
 *   They arrived on Settings because Settings was the only account page that
 *   existed for most roles, and they were immediately the biggest thing on it -
 *   a full-bleed card and a form, above the verification panel and the delete
 *   button, on a page somebody opened to check whether a reviewer had replied.
 *   The card and the picture are not settings at all: nothing about them
 *   configures the product, they ARE the account, and "who am I on Sync" is the
 *   question a profile page answers. Settings keeps what it is for   documents,
 *   verification, the danger zone.
 *
 * ONE COMPONENT, EVERY DASHBOARD
 *   Six roles have this pair and each resolves its card differently: a student's
 *   status lives in student_profiles, a rider's in rider_profiles, an agent's is
 *   a grant rather than a check, a vendor's card is the business one and carries
 *   a logo. So the CARD is passed in, already built by the page that knows which
 *   kind of account it serves, and the ordering, headings and copy live here -
 *   because six pages that each phrase this differently is how a product stops
 *   feeling like one product.
 *
 * `children` is whatever else that role keeps on its profile: the business
 * details behind a vendor's card, and nothing at all for most.
 */
import { SettingsSection } from './settings-section';
import { ProfileForm } from './profile-form';

export function AccountProfile({
  /** The role's own <MySyncIdCard>, or a business form that contains one. */
  idCard,
  cardTitle = 'Your Sync ID',
  cardDescription = 'Show this when somebody asks whether you are really on Sync. The code is checked live, so it always tells the truth about your account   including if it is ever suspended.',
  /**
   * The authority for THIS role, because `profiles.verification_status` is the
   * mirror of vendor_profiles and reports the business decision for anybody who
   * is also a vendor. Omitted, the form falls back to the mirror.
   */
  verificationStatus,
  children,
}: {
  idCard: React.ReactNode;
  cardTitle?: string;
  cardDescription?: string;
  verificationStatus?: string;
  children?: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-8">
      {/* THE CARD FIRST. It is the thing somebody came here to get   proof they
          can hold up   and the form below is the details that decide what it
          says, which is why they are on one page and in this order. */}
      <SettingsSection title={cardTitle} description={cardDescription}>
        {idCard}
      </SettingsSection>

      <SettingsSection
        title="Your information"
        description="Your picture and how you are reached. The picture is yours to choose and yours to remove   it is not the ID document you sent a reviewer, which stays private."
      >
        <ProfileForm verificationStatus={verificationStatus} />
      </SettingsSection>

      {children}
    </section>
  );
}
