/**
 * Live container for /vendor/promotions.
 *
 * `PromotionsPage` is presentation-only and takes `data` + `onCreatePromotion`
 * as props, so this supplies both from the backend and leaves that component
 * untouched.
 *
 * ON THE METRICS
 * `Campaign` asks for views, clicks and revenue. None of those are tracked yet -
 * nothing writes promotion impressions to `analytics_events`. They are reported
 * as 0 rather than invented, because a fabricated conversion rate is worse than
 * an obviously empty one: a vendor would make spending decisions on it.
 * `sales` is real - it is `redemption_count`, incremented by `checkout_cart`.
 */
'use client';

import * as React from 'react';
import { toast } from 'sonner';
import { PromotionsPage } from './PromotionsPage';
import type { CreatePromotionPayload } from './CreatePromotionModal';
import type { Campaign, CampaignStatus, PromotionType, PromotionsPageData } from './types';
import { useMyPromotions, useUpsertPromotion } from '@/modules/vendor/hooks';
import { koboToNaira, nairaToKobo } from '@/lib/query/helpers';
import type { Promotion } from '@/modules/vendor/queries';

/** Status is derived from the window and the active flag, never stored twice. */
function statusOf(p: Promotion): CampaignStatus {
  if (!p.isActive) return 'Paused';

  const now = Date.now();
  const start = new Date(p.startsAt).getTime();
  const end = p.endsAt ? new Date(p.endsAt).getTime() : Infinity;

  if (now < start) return 'Scheduled';
  if (now > end) return 'Ended';

  return 'Active';
}

function toCampaign(p: Promotion): Campaign {
  const budget = p.dailyBudgetKobo ?? 0;

  return {
    id: p.id,
    // Prefer the live listing name; fall back to the snapshot taken at creation.
    name: p.listingName ?? p.name,
    type: (p.promotionType as PromotionType) ?? 'Discount Campaign',
    status: statusOf(p),
    startDate: p.startsAt,
    endDate: p.endsAt ?? p.startsAt,
    // Not tracked yet - see the file header.
    views: 0,
    clicks: 0,
    sales: p.redemptionCount,
    revenue: 0,
    budgetSpent: 0,
    budgetTotal: koboToNaira(budget),
  };
}

export function PromotionsContainer() {
  const { data: promotions = [], isLoading } = useMyPromotions();
  const upsert = useUpsertPromotion();

  const data: PromotionsPageData = React.useMemo(() => {
    const campaigns = promotions.map(toCampaign);

    return {
      activeCampaignCount: campaigns.filter((c) => c.status === 'Active').length,
      stats: {
        totalViews: 0,
        totalClicks: 0,
        conversions: campaigns.reduce((n, c) => n + c.sales, 0),
        revenueGenerated: 0,
      },
      campaigns,
    };
  }, [promotions]);

  async function handleCreate(payload: CreatePromotionPayload) {
    await upsert.mutateAsync(
      {
        // `name` is the snapshot of the listing name at creation time.
        name: payload.campaignName,
        listingId: payload.listingId,
        promotionType: payload.promotionType,
        dailyBudgetKobo: nairaToKobo(payload.dailyBudget),
        startsAt: new Date(payload.startDate).toISOString(),
        endsAt: new Date(payload.endDate).toISOString(),
        // Defaults until the form collects them. A campaign with no discount is
        // still valid - a Featured Listing buys placement, not a price cut.
        discountType: 'percent',
        discountValue: 1,
        isActive: true,
      },
      {
        onSuccess: () => toast.success('Campaign launched'),
        onError: (e) =>
          toast.error(e instanceof Error ? e.message : 'Could not launch the campaign'),
      },
    );
  }

  return (
    <PromotionsPage
      data={data}
      isLoading={isLoading}
      onCreatePromotion={handleCreate}
      isCreating={upsert.isPending}
    />
  );
}
