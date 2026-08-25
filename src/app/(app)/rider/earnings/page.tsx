import { createClient } from '@/lib/supabase/server'
import { getEarningsSummary, getEarningsHistory } from '@/lib/rider/queries'
import { EarningsStatCards } from '@/components/rider-comps/earnings-stat-card'
import { EarningsOverviewChart } from '@/components/rider-comps/earnings-overview-chart'
import { EarningsBreakdownDonut } from '@/components/rider-comps/earnings-breakdown-donut'
import { EarningsHistoryTable } from '@/components/rider-comps/earnings-history-table'

const BYPASS_AUTH_FOR_PREVIEW = true

export default async function EarningsPage() {
    let userId = 'demo-rider'

    if (!BYPASS_AUTH_FOR_PREVIEW) {
        const supabase = await createClient()
        const { data: { user } } = await supabase.auth.getUser()
        userId = user!.id
    }

    const [summary, history] = await Promise.all([
        getEarningsSummary(userId),
        getEarningsHistory(userId),
    ])

    return (
        <div className="flex flex-col gap-6 w-full">
            <div className="flex items-start justify-between gap-4 flex-wrap w-full">
                <div>
                    <p className="text-xs font-semibold text-content-muted">RIDER &gt; EARNINGS</p>
                    <h1 className="text-2xl font-black text-content mt-1">Earnings</h1>
                    <p className="text-sm text-content-muted mt-1">Track your earnings, tips, bonuses and payouts.</p>
                </div>
                <div className="flex items-center gap-2">
                    <button className="rounded-lg border border-line/15 bg-panel px-3 py-2 text-sm font-medium text-content shadow-xs">
                        1 May – 31 May 2026
                    </button>
                    <button className="rounded-lg border border-lime/40 bg-lime/10 px-3 py-2 text-sm font-semibold text-lime-deep dark:text-lime">
                        Download statement
                    </button>
                </div>
            </div>

            <EarningsStatCards summary={summary} />
            <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-4 items-stretch">
                <div className="w-full flex flex-col rounded-xl border border-line/15 bg-panel shadow-xs px-5 py-5 min-w-0">
                    <div className="flex items-center justify-between mb-4">
                        <p className="font-semibold text-content text-sm">Earnings overview</p>
                        <span className="text-xs font-medium text-content-muted border border-line/15 rounded-lg px-2.5 py-1">
                            Daily
                        </span>
                    </div>
                    <div className="flex-1 min-h-[280px] w-full">
                        <EarningsOverviewChart data={summary.daily} />
                    </div>
                </div>

                <div className="w-full h-full flex flex-col rounded-xl border border-line/15 bg-panel shadow-xs px-5 py-5 min-w-0">
                    <div className="flex items-center justify-between mb-4 gap-2">
                        <p className="font-semibold text-content text-sm whitespace-nowrap">Earnings breakdown</p>
                        <a href="#" className="text-xs font-medium text-content-muted hover:text-content shrink-0">
                            View details
                        </a>
                    </div>
                    <div className="flex-1 min-h-0 w-full">
                        <EarningsBreakdownDonut total={summary.totalEarnings} items={summary.breakdown} />
                    </div>
                </div>
            </div>
            <EarningsHistoryTable entries={history} />
        </div>
    )
}