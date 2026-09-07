'use client';

import { useState } from 'react';

import type { RevenueDataPoint } from '@/modules/vendor/types';
import { RevenueChart } from './RevenueChart';

type ChartPeriod = '3M' | '6M' | '1Y';

interface EarningsChartProps {
  /**
   * Top sellers, already ranked and converted to Naira by the caller.
   *
   * Previously this defaulted to a mock `EarningsData` blob and reached into
   * `.bestSellingFood` itself. Taking the points directly means the component
   * no longer needs to know where "best selling" comes from - the page derives
   * it from listings, and a future materialised view can replace that without
   * touching this file.
   */
  data: RevenueDataPoint[];
}

export default function EarningsChart({ data }: EarningsChartProps) {
  const [chartPeriod, setChartPeriod] = useState<ChartPeriod>('1Y');

  if (data.length === 0) {
    return (
      <div className="border-line/10 text-content-muted flex h-[230px] items-center justify-center rounded-xl border text-sm">
        No sales yet. Your best sellers will chart here once orders come in.
      </div>
    );
  }

  return (
    <RevenueChart
      title="Best Selling Food"
      data={data}
      variant="area"
      showPeriodSelector
      activePeriod={chartPeriod}
      onPeriodChange={setChartPeriod}
      height={230}
    />
  );
}
