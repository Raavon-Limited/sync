import { createClient } from '@/lib/supabase/server'
import { getRiderStats } from '@/lib/rider/queries'
import { RiderStatCards, type RiderStat } from '@/components/rider-comps/rider-stat-cards'
import { OnlineToggle } from '@/components/rider-comps/online-toggle'
import { DeliveryProgress } from '@/components/rider-comps/delivery-progress'
import { RecentOrdersList } from '@/components/rider-comps/recent-orders-list'
import { GoOnlineBanner } from '@/components/rider-comps/go-online-banner'
import { EarningsSummaryCard, WeeklyGoalCard } from '@/components/rider-comps/earnings-summary-card'
import { NotificationsCard } from '@/components/rider-comps/notifications-card'
import {
    DEMO_IS_VERIFIED,
    DEMO_RATING,
    DEMO_MILESTONES,
    DEMO_TODAY_DELIVERED,
    DEMO_TODAY_STATS,
    DEMO_WEEKLY_EARNINGS_CHART,
    DEMO_WEEKLY_GOAL,
    DEMO_NOTIFICATIONS,
} from '@/lib/rider/demo-data'
import { getRecentOrders } from '@/lib/rider/queries'

const BYPASS_AUTH_FOR_PREVIEW = true

export default async function RiderDashboard() {
    let userId = 'demo-rider'
    let rating: number | undefined = DEMO_RATING
    let riderName = 'Demo Rider'

    if (!BYPASS_AUTH_FOR_PREVIEW) {
        const supabase = await createClient()
        const { data: { user } } = await supabase.auth.getUser()
        userId = user!.id
        riderName = (user!.user_metadata?.full_name as string) ?? 'Rider'

        const { data: riderProfile } = await supabase
            .from('rider_profiles')
            .select('rating')
            .eq('id', userId)
            .maybeSingle()

        rating = riderProfile?.rating ?? undefined
    }

    const [stats, recentOrders] = await Promise.all([
        getRiderStats(userId),
        getRecentOrders(userId, 4),
    ])

    const statCards: RiderStat[] = [
        {
            key: "earnings",
            label: "Today's earnings",
            value: "₦4,350",
            icon: "earnings",
            change: 12,
        },
        {
            key: "delivered",
            label: "Today's deliveries",
            value: 7,
            icon: "delivered",
            change: 2,
        },
        {
            key: "online-time",
            label: "Online time",
            value: "3h 45m",
            icon: "online-time",
        },
        {
            key: "rating",
            label: "Rating",
            value: "4.9",
            icon: "rating",
            subtitle: "Excellent",
        },
    ];
    return (
        <div className="flex flex-col gap-6">
            {/* Header row: greeting left, online status + bell + avatar right */}
            <div className="flex items-start justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-black text-content">Overview</h1>
                    <p className="text-sm text-content-muted mt-1">Good morning, {riderName}! Ready to deliver? 🚀</p>
                </div>
                <OnlineToggle />
            </div>

            <RiderStatCards stats={statCards} />

            {/* 60/40 split, not 66/33 */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <div className="lg:col-span-3 flex flex-col gap-4">
                    <DeliveryProgress delivered={DEMO_TODAY_DELIVERED} milestones={DEMO_MILESTONES} />

                    <div className="rounded-xl border border-line/15 bg-panel shadow-xs px-5 py-5">
                        <div className="flex items-center justify-between mb-1">
                            <p className="font-semibold text-content text-sm">Recent deliveries</p>
                            <a href="/rider/history" className="text-xs font-medium text-content-muted hover:text-content">View all</a>
                        </div>
                        <RecentOrdersList orders={recentOrders} />
                    </div>

                    <GoOnlineBanner />
                </div>

                <div className="lg:col-span-2 flex flex-col gap-4">
                    <EarningsSummaryCard
                        weekData={DEMO_WEEKLY_EARNINGS_CHART}
                        total={stats.totalEarnings ?? 0}
                        changePercent={18}
                    />
                </div>
            </div>
        </div>
    )
}