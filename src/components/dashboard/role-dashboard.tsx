/**
 * RoleDashboard - the ONE dashboard overview design, shared by every vendor
 * type. The variant (vendor, landlord, …) only changes the *content*: the live
 * profile block, the words (from config/dashboard-content), the data passed in
 * (KPIs, pending rows, chart), and the role-specific lower sections supplied as
 * `children`. There is no second copy of this layout.
 *
 * Server component: it reads the signed-in profile to personalise the eyebrow,
 * verified badge and avatar. The interactive bits (chart, pending list) are
 * client components it renders with plain data.
 */
import type { ReactNode } from 'react';
import Link from 'next/link';
import { ArrowRight, Dot, Wallet, ShoppingBag, Star, AlertTriangle } from 'lucide-react';
import { Badge, Button, Card } from '@/components/ui';
import type { LucideIcon } from 'lucide-react';
import { getDashboardProfile } from '@/components/layouts/dashboard-profile';
import { getCurrentUser } from '@/modules/auth/queries';
import { createClient as createServerClient } from '@/lib/supabase/server';
import type { Row } from '@/lib/supabase/row';
import { isLocked } from '@/components/verification/verify-gate';
import { VerificationBanner } from '@/components/verification/verification-banner';
import { VerifyNowSheet } from '@/components/verification/verify-now-sheet';
import type { VendorCategory } from '@/lib/validations';
import { cn } from '@/lib/utils';
import { DASHBOARD_CONTENT, type DashboardVariant } from '@/config/dashboard-content';

import { CustomCard } from '../shared/card';
import { RevenueDatum } from './revenue-bar-chart';
import { RevenueChartPanel } from './revenue-chart-panel';
import { PendingRequestItem, PendingRequestList } from './pending-request-card';

export interface DashboardKpi {
  label: string;
  value: string;
  sub: string;
  icon?: LucideIcon;
  iconBg?: string;
}

/**
 * Presentation-only lookup: maps a KPI's label to the icon + badge tint
 * shown in its CustomCard. Never sourced from the database — the backend
 * only ever needs to send { label, value, sub }. Add an entry here whenever
 * a new KPI label is introduced; unmatched labels simply render without a
 * badge (CustomCard already handles icon/iconBg being undefined).
 */
/**
 * The tint carries BOTH the ground and the ink, and it has to.
 *
 * CustomCard puts this string on the wrapper around the icon, and the icon
 * itself is a bare lucide glyph drawn in `currentColor`. So with a background
 * alone the glyph inherited whatever the card's text colour was — cream in dark
 * mode — and a cream wallet on `bg-emerald-100` mint was invisible. Every other
 * card in the app that uses this component colours its own icon
 * (`text-blue-600` and so on); this map was the one place that did not.
 *
 * THE HUE IS IN THE GROUND; THE CONTRAST IS IN A TOKEN.
 *   ground  `bg-<hue>-500/15` — an ALPHA tint, not the fixed `-100` shade it
 *           used to be. A translucent hue composites correctly over cream AND
 *           over ink, where a fixed pale shade is a light-mode decision baked
 *           into a theme-aware surface. This is the pattern the rest of the
 *           codebase already settled on.
 *   glyph   `text-content` — the same token the card's own text uses, so it is
 *           ink on the cream theme and cream on the dark one. Legible in both
 *           by construction rather than by a colour someone eyeballed.
 *
 * WHY NOT `dark:text-<hue>-400`, WHICH IS THE OBVIOUS FIX.
 *   It would not fire. This app switches themes with a `.dark` CLASS on the
 *   root (see ThemeToggle), while Tailwind's `dark:` variant defaults to
 *   `@media (prefers-color-scheme: dark)` and no `@custom-variant dark` is
 *   declared in globals.css. So `dark:` tracks the OS, not the toggle: someone
 *   on a light OS who switches the app to dark gets the light-mode colour, and
 *   the auth layout — which forces `.dark` on its subtree — never gets the dark
 *   one at all. A token has no such gap.
 *
 *   The four hues still tell the cards apart; at 40px the tile is what carries
 *   that, not the stroke inside it.
 */
const KPI_STYLE: Record<string, { icon: LucideIcon; iconBg: string }> = {
  'Total Revenue': { icon: Wallet, iconBg: 'bg-emerald-500/15 text-content' },
  Orders: { icon: ShoppingBag, iconBg: 'bg-blue-500/15 text-content' },
  'Store Rating': { icon: Star, iconBg: 'bg-amber-500/15 text-content' },
  'Stock Alerts': { icon: AlertTriangle, iconBg: 'bg-red-500/15 text-content' },
};

function withKpiStyle(kpi: DashboardKpi): DashboardKpi {
  const style = KPI_STYLE[kpi.label];
  return {
    ...kpi,
    icon: kpi.icon ?? style?.icon,
    iconBg: kpi.iconBg ?? style?.iconBg,
  };
}

interface RoleDashboardProps {
  variant: DashboardVariant;
  /** Headline + pending-list count. */
  count: number;
  kpis: DashboardKpi[];
  pending: PendingRequestItem[];
  /** Initial chart data, shown for the "weekly" period on first paint. */
  chart: RevenueDatum[];
  /** Role-specific lower sections (e.g. products & earnings, or hostels). */
  children?: ReactNode;
}

export async function RoleDashboard({
  variant,
  count,
  kpis,
  pending,
  chart,
  children,
}: RoleDashboardProps) {
  const content = DASHBOARD_CONTENT[variant];
  const profile = await getDashboardProfile(variant);

  // Prefill for the verification panel, read on the SERVER and passed down as
  // plain data — the same user_metadata /onboarding reads, so both hosts of the
  // wizard open with the same fields already filled in.
  const user = await getCurrentUser();
  const meta = user?.user_metadata ?? {};

  // Same reasoning as /onboarding: a claimed business name is frozen, so the
  // panel has to open with the one on record or the vendor is being invited to
  // type something the server will refuse.
  let businessName: string | undefined;
  if (user?.id) {
    const supabase = await createServerClient();
    const { data } = await supabase
      .from('vendor_profiles')
      .select('business_name')
      .eq('id', user.id)
      .maybeSingle();
    businessName =
      ((data as unknown as Row | null)?.business_name as string | undefined) ?? undefined;
  }

  const verifyInitial = {
    fullName: (meta.full_name as string | undefined) ?? '',
    phone: (meta.phone as string | undefined) ?? '',
    vendorCategory: meta.vendor_category as VendorCategory | undefined,
    businessName,
  };
  // Three states, not two. "Submitted and waiting" is neither verified nor a
  // prompt to go and verify - telling someone who has already sent their
  // documents to verify their account reads as though it never arrived.
  const status = profile.verificationStatus;
  const verified = status === 'verified';
  const awaitingReview = status === 'pending';
  // Everything below the header is data this account has not earned the right
  // to have yet. The shell still renders - see verify-gate for why a redirect
  // would be worse.
  const locked = isLocked(status);
  const storeName = profile.metaValue;
  // The count IS live - dash.counts.pending for a vendor, awaiting.length for
  // a landlord. It only looked hardcoded because the gate emptied the list
  // underneath it and left the headline claiming two orders over nothing. A
  // locked dashboard reports zero because zero is what it can show.
  const shownCount = locked ? 0 : count;
  const { lead, accent } = content.headline(shownCount);
  const ActionIcon = content.action?.icon;
  // Locked KPIs keep their labels and lose their numbers. A row of zeroes
  // would be a claim about their business; an em-dash is an absence.
  const styledKpis = (
    locked ? kpis.map((k) => ({ ...k, value: '—', sub: 'After verification' })) : kpis
  ).map(withKpiStyle);

  // Only the "go and do something" state is a link, so only it gets the
  // pointer and the hover. Built once so the two forms cannot drift apart.
  const actionable = !verified && !awaitingReview;
  const badge = (
    <Badge
      variant={awaitingReview ? 'muted' : 'accent'}
      className={cn(
        'border-line/50 flex items-center self-start border whitespace-normal sm:self-auto sm:whitespace-nowrap',
        actionable && 'hover:bg-lime/80 cursor-pointer transition-colors',
      )}
    >
      <span className="relative inline-flex items-center justify-center">
        <Dot size={20} className="relative z-10" />
        {/* The ping is an attention-getter. Nothing needs their attention
            while a reviewer already has it. */}
        {!awaitingReview && <Dot size={20} className="absolute animate-ping opacity-75" />}
      </span>
      {verified ? profile.eyebrow : awaitingReview ? content.pendingBadge : content.unverifiedBadge}
    </Badge>
  );

  return (
    <section className="flex flex-col gap-3">
      <h1 className="text-content-muted max-w-xl font-mono text-sm tracking-wide">
        {content.eyebrow}
        {storeName ? ` . ${storeName.toUpperCase()}` : ''}
      </h1>

      <div className="w-full flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="mb-2 flex items-center justify-between gap-3">
          {/* Unverified is not a status line, it is the one thing gating this
              account - and the pill was pulsing at people with nowhere to go.
              It now opens the wizard that clears it, in a panel over this
              dashboard rather than by navigating away from the numbers it is
              about to unlock. The verified badge stays inert: there is nothing
              behind "Verified landlord". */}
          {actionable ? (
            <VerifyNowSheet initial={verifyInitial}>
              <button
                type="button"
                className="cursor-pointer border-0 bg-transparent p-0 text-left"
              >
                {badge}
              </button>
            </VerifyNowSheet>
          ) : (
            badge
          )}
        </div>
        <div className="flex flex-col items-start gap-3 md:flex-row md:items-center md:justify-between">
          <h2 className="text-section text-content font-display mt-2 font-medium md:mt-0">
            {lead} <span className="text-lime-deep">{accent}</span>
          </h2>
          {content.action &&
            (locked ? (
              // Still shown, so they can see what verifying buys them - but it
              // cannot be pressed, because the server would refuse it anyway.
              <Button
                disabled
                title="Available once your account is verified"
                className="mt-4 flex items-center justify-end gap-2 md:mt-0 md:justify-start"
              >
                {ActionIcon && <ActionIcon />}
                {content.action.label}
              </Button>
            ) : (
              <Link href={content.action.href}>
                <Button className="mt-4 flex items-center justify-end gap-2 md:mt-0 md:justify-start">
                  {ActionIcon && <ActionIcon />}
                  {content.action.label}
                </Button>
              </Link>
            ))}
        </div>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-4">
        {styledKpis.map(({ label, value, sub, icon: Icon, iconBg }) => (
          <CustomCard
            key={label}
            className="border-line/10 shadow-2xl"
            label={label}
            value={value}
            subtext={sub}
            icon={Icon && <Icon className="h-5 w-5" />}
            iconBg={iconBg}
          />
        ))}
      </div>

      {/* Under the KPI row, not above the headline: the cards are the first
          thing read, and a banner above them pushes the whole dashboard down
          to say something that is not urgent. Here it sits between the numbers
          it just emptied and the panels it is about to empty. */}
      <VerificationBanner status={status} initial={verifyInitial} className="mt-1" />

      {/* Pending list + revenue chart */}
      <section className="mt-5">
        {/* items-stretch, not items-start: the two columns are a matched pair
            and a short pending list should not leave a ragged edge beside a
            full-height chart. */}
        <div className="flex flex-col gap-6 lg:flex-row lg:items-stretch">
          <Card className="border-line/5 flex flex-1 flex-col border p-5">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-content-muted text-body font-mono uppercase">
                {content.pendingTitle} . {shownCount}
              </h2>
              {content.pendingViewAllHref && (
                <Link href={content.pendingViewAllHref}>
                  <Button
                    variant="outline"
                    className="text-content-muted border-transparent font-light"
                  >
                    View all <ArrowRight />
                  </Button>
                </Link>
              )}
            </div>
            <PendingRequestList items={locked ? [] : pending} />
          </Card>

          <div className="flex-1">
            <RevenueChartPanel initialData={locked ? [] : chart} initialPeriod="weekly" />
          </div>
        </div>
      </section>

      {/* Role-specific lower sections - hostels, products, earnings - are the
          business itself, and none of it exists before verification. Hidden
          rather than replaced by a second "verification in review" panel: the
          banner above already said it once, and saying it twice on one screen
          reads as an error rather than a state. */}
      {locked ? null : children}
    </section>
  );
}
