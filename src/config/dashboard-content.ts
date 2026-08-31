/**
 * Per-variant CONTENT for the shared dashboard overview. The layout/design lives
 * once in <RoleDashboard>; this module only supplies the words (and an optional
 * CTA) that differ between vendor types. Data (KPIs, pending rows, chart) is
 * passed in by each route's page from its own source.
 *
 * Icon-data only (no hooks/JSX) so it stays cheap to import on the server.
 */
import { Megaphone } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

export type DashboardVariant = 'vendor' | 'landlord';

export interface DashboardContentConfig {
  /** Eyebrow prefix, e.g. "VENDOR DASHBOARD" (store name is appended live). */
  eyebrow: string;
  /** Headline split into a plain lead and an accent-coloured tail, given the count. */
  headline: (count: number) => { lead: string; accent: string };
  /** Title above the pending list, e.g. "Pending orders". */
  pendingTitle: string;
  /** "View all" target for the pending list. */
  pendingViewAllHref?: string;
  /** Optional primary CTA shown by the headline (vendor advertises; landlord doesn't). */
  action?: { label: string; href: string; icon: LucideIcon };
  /**
   * What this role does here, in the gerund - "taking orders", "letting your
   * rooms". Completes the locked-state copy: "Verify to start taking orders"
   * says what is behind the wall, where a bare "Locked" says nothing.
   */
  gatedActivity: string;
  /** Badge text shown when the account isn't verified yet. */
  unverifiedBadge: string;
  /**
   * Shown once they have submitted and are waiting on a reviewer. A distinct
   * state, not a shade of "unverified": there is nothing left for them to do,
   * so inviting them to verify again is asking for a duplicate submission.
   */
  pendingBadge: string;
  /**
   * Where that badge sends them. Both business roles clear verification in the
   * same `/onboarding` wizard - see the note in (auth)/verify/verify-form.
   */
  verifyHref: string;
}

export const DASHBOARD_CONTENT: Record<DashboardVariant, DashboardContentConfig> = {
  vendor: {
    eyebrow: 'VENDOR DASHBOARD',
    headline: (count) => ({ lead: `${count} new`, accent: 'orders.' }),
    pendingTitle: 'Pending orders',
    pendingViewAllHref: '/vendor/orders',
    action: { label: 'Advertise now', href: '/vendor/promotions', icon: Megaphone },
    gatedActivity: 'taking orders',
    unverifiedBadge: 'Verify your store',
    pendingBadge: 'Verification pending',
    verifyHref: '/onboarding',
  },
  landlord: {
    eyebrow: 'LANDLORD DASHBOARD',
    headline: (count) => ({ lead: `${count} new requests`, accent: 'this week.' }),
    pendingTitle: 'Pending booking requests',
    pendingViewAllHref: '/landlord/requests',
    gatedActivity: 'letting your rooms',
    unverifiedBadge: 'Verify your account',
    pendingBadge: 'Verification pending',
    verifyHref: '/onboarding',
  },
};
