/**
 * ROUTE: /user/profile
 * ACCESS: authenticated student
 * PURPOSE: Profile editing - picture, name + phone, via the secure RTK Query → /api/profile
 * path (route handler enforces auth + field whitelist; Supabase is never hit
 * from the client). Role + verification status are shown read-only.
 *
 * THE STATUS IS RESOLVED HERE, NOT IN THE FORM
 *   `profiles.verification_status` is the MIRROR of vendor_profiles. For a
 *   student it reports the business decision, so a student an admin had
 *   verified was reading "Unverified" on their own profile - the same trap that
 *   had /user and the settings panel wrong. student_profiles is the authority
 *   (20260903180000) and only the server can read it, so it is passed down.
 */
import type { Metadata } from 'next';
import { ProfileForm } from '@/components/account/profile-form';
import { getMyStudentIdentity } from '@/modules/students';

export const metadata: Metadata = { title: 'Profile' };

export default async function Page() {
  const identity = await getMyStudentIdentity();

  return (
    <section className="flex flex-col gap-6">
      <ProfileForm verificationStatus={identity.verificationStatus} />
    </section>
  );
}
