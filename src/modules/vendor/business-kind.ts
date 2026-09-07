/**
 * Which business dashboard this account belongs on.
 *
 * THE CATEGORY DECIDES, NOT THE ROLE AND NOT THE URL.
 *   A landlord is a `vendor_profiles` row with `category = 'landlord'`, and
 *   until now three separate things each decided independently which dashboard
 *   they saw: `profiles.role` (the proxy gate and the handle rewrite),
 *   `navKey` (hardcoded per layout), and the category (the onboarding
 *   redirect). When those three agree nobody notices. When they drift, somebody
 *   with a hostel gets the food-vendor sidebar   Stores, Listings, Orders and a
 *   store switcher for a business that will never have one.
 *
 *   They drift easily. `set_vendor_category` moves `role` only when the caller
 *   was already wearing a business hat, so picking "landlord" while wearing
 *   'student' or 'vendor' leaves the role behind. So does anything that failed
 *   halfway. The category is the one of the three that is written by the
 *   decision itself and never inferred, so it is the one that answers.
 *
 * NULL MEANS THERE IS NO BUSINESS YET   an account that claimed the role and
 * abandoned the wizard. Neither dashboard redirects in that case: the sidebar
 * collapses to the overview instead (see DashboardProfile.businessReady), which
 * is where the wizard can be finished.
 */
import 'server-only';
import { createClient } from '@/lib/supabase/server';

export type BusinessKind = 'landlord' | 'vendor';

/**
 * The caller's business kind, or null when they have no business row.
 *
 * Returns null on error too, and that is deliberate: every caller uses this to
 * decide whether to REDIRECT, and a failed lookup must not bounce somebody off
 * a dashboard they are entitled to. Staying put on a transient error is the
 * recoverable outcome; a redirect loop is not.
 */
export async function getBusinessKind(): Promise<BusinessKind | null> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return null;

    const { data, error } = await supabase
      .from('vendor_profiles')
      .select('category')
      .eq('id', user.id)
      .maybeSingle();

    if (error || !data) return null;
    return (data.category as string) === 'landlord' ? 'landlord' : 'vendor';
  } catch {
    return null;
  }
}
