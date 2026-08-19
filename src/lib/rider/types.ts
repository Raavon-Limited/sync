export interface RiderOrder {
  id: string
  orderNumber: string
  vendorName: string
  vendorLogo: string | null
  vendorPhone?: string
  deliveryAddress: string
  studentPhone?: string
  items: { name: string; qty: number }[]
  total: number
  // NOTE: 'cancelled' | 'failed' are used by history-list/detail-sheet but
  // are NOT in the Supabase check constraint from the schema we wrote
  // earlier — that constraint only allows the first five values. If riders
  // can actually cancel/fail a delivery, the SQL constraint needs updating
  // too (flagged below), otherwise these two values will only ever appear
  // in demo data, never in real rows.
  status: 'preparing' | 'rider_assigned' | 'picked_up' | 'on_the_way' | 'delivered' | 'cancelled' | 'failed'
  etaMinutes: number
  distanceKm?: number
  createdAt: string
  riderId: string | null
  // History/rating fields — populated for delivered orders only
  customerName?: string
  customerRating?: number | null
  earningsBreakdown?: { base: number; tip: number; bonus: number }
}
export interface EarningsEntry {
  id: string
  date: string // ISO
  type: 'earning' | 'bonus' | 'payout' | 'adjustment'
  orderRef?: string
  title: string
  detail: string
  amount: number // negative for payouts
  balanceAfter: number
}

export interface EarningsBreakdownItem {
  label: string
  amount: number
  percent: number
  colorClass: string // tailwind bg-* class for the donut segment + dot
}

export interface EarningsDailyPoint {
  label: string // '1 May'
  amount: number
}

export interface EarningsSummary {
  totalEarnings: number
  totalEarningsChangePercent: number
  deliveriesCompleted: number
  deliveriesChangePercent: number
  avgPerDelivery: number
  avgChangePercent: number
  pendingPayout: number
  nextPayoutDate: string
  breakdown: EarningsBreakdownItem[]
  daily: EarningsDailyPoint[]
}