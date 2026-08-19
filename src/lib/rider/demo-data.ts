import type { RiderOrder } from './types'
// import type { DashboardProfile } from '@/modules/auth/dashboard-profile'
import type { DashboardProfile } from '@/components/layouts/dashboard-profile'

export const DEMO_ACTIVE_ORDER: RiderOrder = {
    id: 'demo-order-1',
    orderNumber: 'SYNC-0231',
    vendorName: 'Mama Put Tanke',
    vendorLogo: null,
    vendorPhone: '+2348012345678',
    deliveryAddress: 'Hostel B, Block 3, Room 214',
    studentPhone: '+2348098765432',
    items: [
        { name: 'Jollof Rice', qty: 2 },
        { name: 'Fried Chicken', qty: 1 },
    ],
    total: 3200,
    status: 'rider_assigned',
    etaMinutes: 25,
    distanceKm: 1.8,
    createdAt: new Date().toISOString(),
    riderId: 'demo-rider',
}

export const DEMO_AVAILABLE_ORDERS: RiderOrder[] = [
    {
        id: 'demo-order-2',
        orderNumber: 'SYNC-0198',
        vendorName: 'Burger King',
        vendorLogo: null,
        vendorPhone: '+2348011122233',
        deliveryAddress: 'Caffeine Co., Table 4',
        items: [{ name: 'Loaded Fries', qty: 1 }],
        total: 1800,
        status: 'preparing',
        etaMinutes: 20,
        distanceKm: 1.2,
        createdAt: new Date().toISOString(),
        riderId: null,
    },
    {
        id: 'demo-order-3',
        orderNumber: 'SYNC-0204',
        vendorName: 'Iya Afusa',
        vendorLogo: null,
        vendorPhone: '+2348033344455',
        deliveryAddress: 'Basin Area, House 12',
        items: [{ name: 'Amala', qty: 1 }, { name: 'Ewa Agoyin', qty: 1 }],
        total: 2500,
        status: 'preparing',
        etaMinutes: 30,
        distanceKm: 2.4,
        createdAt: new Date().toISOString(),
        riderId: null,
    },
]

export const DEMO_RECENT_ORDERS: RiderOrder[] = [
    {
        id: 'demo-recent-1',
        orderNumber: 'SYNC-0176',
        vendorName: 'Chewy Chops',
        vendorLogo: null,
        deliveryAddress: 'GRA, House 8',
        items: [{ name: 'Small Chops', qty: 2 }],
        total: 1500,
        status: 'delivered',
        etaMinutes: 0,
        createdAt: new Date(Date.now() - 3 * 3600_000).toISOString(),
        riderId: 'demo-rider',
    },
    {
        id: 'demo-recent-2',
        orderNumber: 'SYNC-0165',
        vendorName: 'Arena',
        vendorLogo: null,
        deliveryAddress: 'Tanke Lodge, Room 4',
        items: [{ name: 'Jollof combo', qty: 1 }],
        total: 2200,
        status: 'delivered',
        etaMinutes: 0,
        createdAt: new Date(Date.now() - 26 * 3600_000).toISOString(),
        riderId: 'demo-rider',
    },
    {
        id: 'demo-recent-3',
        orderNumber: 'SYNC-0152',
        vendorName: 'Fast joint',
        vendorLogo: null,
        deliveryAddress: 'Tarmac, Room 9',
        items: [{ name: 'Chips', qty: 1 }],
        total: 1200,
        status: 'cancelled',
        etaMinutes: 0,
        createdAt: new Date(Date.now() - 50 * 3600_000).toISOString(),
        riderId: 'demo-rider',
    },
]

export const DEMO_STATS = { completedDeliveries: 12, totalEarnings: 24500 }

export const DEMO_TODAY_STATS = {
    delivered: 4,
    earnings: 8200,
    avgRating: 4.9,
    acceptanceRate: 92,
}

export const DEMO_WEEK_STATS = {
    delivered: 12,
    earnings: 24500,
    deliveredChange: 8,
    earningsChange: 12,
}

export const DEMO_RIDER_PROFILE: DashboardProfile = {
    eyebrow: 'Verified rider',
    name: 'Demo Rider',
    email: 'rider@demo.sync',
    initial: 'D',
    metaLabel: 'Vehicle',
    metaValue: 'Motorcycle',
}

export const DEMO_RATING = 4.8
export const DEMO_IS_VERIFIED = true

export const DEMO_MILESTONES = [2, 5, 8, 10]
export const DEMO_TODAY_DELIVERED = 8

export const DEMO_WEEKLY_EARNINGS_CHART = [
    { day: 'Mon', amount: 1800 },
    { day: 'Tue', amount: 3200 },
    { day: 'Wed', amount: 2600 },
    { day: 'Thu', amount: 3900 },
    { day: 'Fri', amount: 5100 },
    { day: 'Sat', amount: 6200 },
    { day: 'Sun', amount: 1900 },
]

export const DEMO_WEEKLY_GOAL = { current: 24680, target: 100000, endsInDays: 2 }

export const DEMO_NOTIFICATIONS = [
    { id: 'n1', type: 'promo', title: 'Peak hours bonus active!', body: 'Earn more between 5PM – 9PM today.', time: '2m ago' },
    { id: 'n2', type: 'bonus', title: 'You earned a ₦500 bonus', body: 'For completing 5 deliveries yesterday.', time: '1h ago' },
    { id: 'n3', type: 'wallet', title: 'Wallet update', body: 'Your payout of ₦18,500 was successful.', time: '2h ago' },
]

import type { EarningsEntry, EarningsSummary } from './types'

export const DEMO_EARNINGS_SUMMARY: EarningsSummary = {
    totalEarnings: 42300,
    totalEarningsChangePercent: 18,
    deliveriesCompleted: 42,
    deliveriesChangePercent: 7,
    avgPerDelivery: 1007,
    avgChangePercent: 6,
    pendingPayout: 0,
    nextPayoutDate: '2 Jun 2026',
    breakdown: [
        { label: 'Base fare', amount: 28900, percent: 68, colorClass: 'bg-lime-deep dark:bg-lime' },
        { label: 'Tips', amount: 7600, percent: 18, colorClass: 'bg-lime/50' },
        { label: 'Bonuses', amount: 4800, percent: 11, colorClass: 'bg-purple-400' },
        { label: 'Adjustments', amount: 1000, percent: 3, colorClass: 'bg-yellow-400' },
    ],
    daily: [
        { label: '1 May', amount: 350 },
        { label: '6 May', amount: 720 },
        { label: '11 May', amount: 640 },
        { label: '16 May', amount: 1280 },
        { label: '21 May', amount: 1650 },
        { label: '26 May', amount: 1150 },
        { label: '31 May', amount: 780 },
    ],
}

export const DEMO_EARNINGS_HISTORY: EarningsEntry[] = [
    { id: 'e1', date: '2026-05-31T19:45:00', type: 'earning', orderRef: 'ORD-8791', title: 'Harmony Estate → Moon Hall', detail: 'Base fare · Delivery fee', amount: 850, balanceAfter: 42300 },
    { id: 'e2', date: '2026-05-31T19:45:00', type: 'earning', orderRef: 'ORD-8791', title: 'Harmony Estate → Moon Hall', detail: 'Tip from student', amount: 200, balanceAfter: 41450 },
    { id: 'e3', date: '2026-05-31T18:10:00', type: 'bonus', title: 'Surge bonus', detail: 'Evening peak', amount: 300, balanceAfter: 41250 },
    { id: 'e4', date: '2026-05-30T23:20:00', type: 'payout', title: 'Payout to bank', detail: 'Guaranty Trust Bank ••••6789 · Weekly payout 23 – 29 May 2026', amount: -38500, balanceAfter: 40950 },
    { id: 'e5', date: '2026-05-30T16:05:00', type: 'earning', orderRef: 'ORD-8722', title: 'TasteBite → New Hall', detail: 'Base fare', amount: 950, balanceAfter: 79450 },
]