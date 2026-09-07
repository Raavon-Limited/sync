/**
 * ROUTE: /user/profile
 * ACCESS: authenticated student
 * PURPOSE: Who this student is on Sync - the ID card, and the picture, name and
 * phone behind it. Edits go through the secure RTK Query → /api/profile path
 * (the route handler enforces auth and a field whitelist; Supabase is never hit
 * from the client).
 *
 * THE CARD MOVED HERE FROM SETTINGS
 *   It was the first and largest thing on /user/settings, above the panel that
 *   page exists for. A card is not a setting - see AccountProfile.
 *
 * THE STATUS IS RESOLVED HERE, NOT IN THE FORM
 *   `profiles.verification_status` is the MIRROR of vendor_profiles. For a
 *   student it reports the business decision, so a student an admin had
 *   verified was reading "Unverified" on their own profile - the same trap that
 *   had /user and the settings panel wrong. student_profiles is the authority
 *   (20260903180000) and only the server can read it, so it is passed down.
 */
import type { Metadata } from 'next';
import { AccountProfile } from '@/components/account/account-profile';
import { MySyncIdCard } from '@/components/account/my-sync-id-card';
import { getMyStudentIdentity } from '@/modules/students';
import { getCurrentUser, getProfile } from '@/modules/auth/queries';

export const metadata: Metadata = { title: 'Profile' };

export default async function Page() {
  const [identity, profile, user] = await Promise.all([
    getMyStudentIdentity(),
    getProfile(),
    // The join date lives on the auth user, not on the profile row.
    getCurrentUser(),
  ]);

  return (
    <AccountProfile
      verificationStatus={identity.verificationStatus}
      idCard={
        <MySyncIdCard
          kind="student"
          holderName={profile?.full_name ?? null}
          context={identity.department ? `Student · ${identity.department}` : 'Student'}
          status={identity.verificationStatus}
          memberSince={user?.created_at ?? null}
          photoUrl={profile?.avatar_url ?? null}
          facts={
            identity.matricNumber ? [{ label: 'Matric number', value: identity.matricNumber }] : []
          }
          fileName="student"
        />
      }
    />
  );
}
