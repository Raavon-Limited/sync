/**
 * getDashboardProfile - builds the real signed-in profile block shown at the top
 * of every dashboard sidebar (replaces the old hard-coded "AO" mock avatar).
 *
 * Reads the server-trusted profiles table (falling back to auth metadata) and
 * shapes a small, serialisable summary the client <DashboardSidebar> can render.
 * Per-role eyebrow + meta line differ, so it's keyed by the same nav key the
 * shell uses.
 */
import { getCurrentUser, getProfile } from '@/modules/auth/queries';
import type { VerificationStatus } from '@/modules/verification/types';
import { createClient } from '@/lib/supabase/server';
import { resolveHandle } from '@/lib/handle';
import type { DashboardNavKey } from '@/config/dashboard-nav';

/**
 * The student's university, for the sidebar profile card.
 *
 * Two sources, and both are legitimate: `campus_id` when they picked one we
 * know, `campus_other` when they typed one we do not have. A student at an
 * unlisted university still has a university, and their own dashboard is the
 * last place to pretend otherwise.
 *
 * Degrades to undefined - the card simply omits the line. It is decoration on
 * a page that must render, so a failed lookup is not worth an error.
 */
async function campusLine(profile: {
  campus_id?: string | null;
  campus_other?: string | null;
} | null): Promise<string | undefined> {
  if (!profile) return undefined;
  if (profile.campus_other) return profile.campus_other;
  if (!profile.campus_id) return undefined;

  try {
    const supabase = await createClient();
    const { data } = await supabase
      .from('campuses')
      .select('code, name')
      .eq('id', profile.campus_id)
      .maybeSingle();
    if (!data) return undefined;
    // The code is what students say out loud; the full name is the fallback
    // for a campus that has no short form.
    return (data.code as string | null) || (data.name as string | null) || undefined;
  } catch {
    // Pre-migration databases have no campuses columns at all.
    return undefined;
  }
}

export interface DashboardProfile {
  /** Status/role line above the name, e.g. "Verified vendor". */
  eyebrow: string;
  /**
   * The raw status, so callers stop inferring it from `eyebrow` with
   * `.startsWith('Verified')`. That test could only ever answer yes/no, which
   * is why someone who had already submitted was still being told to verify.
   */
  verificationStatus: VerificationStatus;
  name: string;
  email: string;
  /** Uppercase initial(s) for the avatar fallback. */
  initial: string;
  /** Optional secondary detail (label + value), e.g. "Business · HiFoods". */
  metaLabel?: string;
  metaValue?: string;
  /** Profile picture URL (Supabase Storage later); falls back to initials. */
  avatarUrl?: string;
  /**
   * Personalised dashboard handle (student/vendor only) used to build name-based
   * URLs like `/muiz-owolabi/insights`. Derived from the same user_metadata the
   * proxy uses, so sidebar links and the proxy rewrite always agree.
   */
  handle?: string;
  /** The hat being worn, and every hat held — feeds the account switcher. */
  role?: string;
  roles?: string[];
}

const CATEGORY_LABELS: Record<string, string> = {
  landlord: 'Landlord',
  food: 'Food vendor',
  beauty: 'Beauty pro',
  laundry: 'Laundry',
  tradesman: 'Tradesman',
};

export async function getDashboardProfile(navKey: DashboardNavKey): Promise<DashboardProfile> {
  const [user, profile] = await Promise.all([getCurrentUser(), getProfile()]);
  const meta = user?.user_metadata ?? {};

  const name =
    profile?.full_name ||
    (meta.full_name as string | undefined) ||
    user?.email?.split('@')[0] ||
    'You';
  const email = user?.email ?? '';
  const initial = name.trim().charAt(0).toUpperCase() || 'Y';
  const status = (profile?.verification_status ?? 'unverified') as VerificationStatus;
  const verified = status === 'verified';

  // Handle is derived from user_metadata (+ email), NOT the profile row, so it
  // matches exactly what the proxy computes when rewriting the name-based URL.
  // vendor and landlord both key off business_name, so they resolve alike - but
  // pass the real role through rather than collapsing landlord into 'vendor'.
  const handleRole = navKey === 'student' ? 'student' : navKey === 'landlord' ? 'landlord' : 'vendor';
  const handle =
    navKey === 'admin'
      ? undefined
      : (resolveHandle({
          role: handleRole,
          full_name: meta.full_name as string | undefined,
          business_name: meta.business_name as string | undefined,
          email: user?.email,
        }) ?? undefined);

  /**
   * The hats this account holds, for the switcher in the account menu. Spread
   * into every branch below: computing it inside one of them is how the
   * switcher ends up appearing on the vendor dashboard and nowhere else.
   *
   * The fallback covers the window before `profiles.roles` exists — the column
   * arrives in 20260830090000, and until then everyone holds exactly the role
   * they are wearing, which makes the switcher correctly render nothing.
   */
  const hats = {
    role: profile?.role,
    roles: profile?.roles ?? (profile?.role ? [profile.role] : []),
  };

  switch (navKey) {
    case 'vendor':
      return {
        ...hats,
        verificationStatus: status,
        eyebrow: verified ? 'Verified vendor' : 'Vendor',
        name,
        email,
        initial,
        handle,
        metaLabel: 'Business',
        metaValue:
          profile?.business_name ||
          (profile?.vendor_category ? CATEGORY_LABELS[profile.vendor_category] : undefined),
      };
    case 'landlord':
      return {
        ...hats,
        verificationStatus: status,
        eyebrow: verified ? 'Verified landlord' : 'Landlord',
        name,
        email,
        initial,
        handle,
        metaLabel: 'Properties',
        metaValue: profile?.business_name || undefined,
      };
    case 'admin':
      return {
        ...hats,
        verificationStatus: status,
        eyebrow: profile?.role === 'super_admin' ? 'Super admin' : 'Admin',
        name,
        email,
        initial,
      };
    case 'student':
    default:
      return {
        ...hats,
        verificationStatus: status,
        eyebrow: 'Student',
        name,
        email,
        initial,
        handle,
        // The university, on the card, using the meta slot every other role
        // already uses for its defining detail (Business, Properties).
        metaLabel: 'University',
        metaValue: await campusLine(
          profile as { campus_id?: string | null; campus_other?: string | null } | null,
        ),
      };
  }
}
