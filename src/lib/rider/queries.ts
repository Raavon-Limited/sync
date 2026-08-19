import 'server-only'
import { createClient } from '@/lib/supabase/server'
import type { RiderOrder, EarningsSummary, EarningsEntry } from './types'
import {
    DEMO_ACTIVE_ORDER,
    DEMO_AVAILABLE_ORDERS,
    DEMO_RECENT_ORDERS,
    DEMO_STATS,
    DEMO_EARNINGS_SUMMARY,
    DEMO_EARNINGS_HISTORY,
} from './demo-data'

export async function getActiveOrder(riderId: string): Promise<RiderOrder | null> {
    try {
        const supabase = await createClient()
        const { data, error } = await supabase
            .from('orders')
            .select('id, vendor_name, vendor_logo, delivery_address, items, total, status, eta_minutes, created_at, rider_id')
            .eq('rider_id', riderId)
            .neq('status', 'delivered')
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle()

        if (error || !data) return null
        return mapRow(data)
    } catch {
        return DEMO_ACTIVE_ORDER
    }
}

export async function getAvailableOrders(): Promise<RiderOrder[]> {
    try {
        const supabase = await createClient()
        const { data, error } = await supabase
            .from('orders')
            .select('id, vendor_name, vendor_logo, delivery_address, items, total, status, eta_minutes, created_at, rider_id')
            .is('rider_id', null)
            .eq('status', 'preparing')
            .order('created_at', { ascending: true })

        if (error || !data) return DEMO_AVAILABLE_ORDERS
        return data.map(mapRow)
    } catch {
        return DEMO_AVAILABLE_ORDERS
    }
}

export async function getRecentOrders(riderId: string, limit = 5): Promise<RiderOrder[]> {
    try {
        const supabase = await createClient()
        const { data, error } = await supabase
            .from('orders')
            .select('id, vendor_name, vendor_logo, delivery_address, items, total, status, eta_minutes, created_at, rider_id')
            .eq('rider_id', riderId)
            .eq('status', 'delivered')
            .order('created_at', { ascending: false })
            .limit(limit)

        if (error || !data) return DEMO_RECENT_ORDERS
        return data.map(mapRow)
    } catch {
        return DEMO_RECENT_ORDERS
    }
}

export async function getOrderById(orderId: string, riderId: string): Promise<RiderOrder | null> {
    try {
        const supabase = await createClient()
        const { data, error } = await supabase
            .from('orders')
            .select('id, vendor_name, vendor_logo, delivery_address, items, total, status, eta_minutes, created_at, rider_id')
            .eq('id', orderId)
            .eq('rider_id', riderId)
            .maybeSingle()

        if (error || !data) return null
        return mapRow(data)
    } catch {
        const demoPool = [DEMO_ACTIVE_ORDER, ...DEMO_AVAILABLE_ORDERS, ...DEMO_RECENT_ORDERS]
        return demoPool.find(o => o.id === orderId) ?? DEMO_ACTIVE_ORDER
    }
}

export async function getRiderStats(riderId: string) {
    try {
        const supabase = await createClient()
        const { count } = await supabase
            .from('orders')
            .select('*', { count: 'exact', head: true })
            .eq('rider_id', riderId)
            .eq('status', 'delivered')

        if (count === null) return DEMO_STATS
        return { completedDeliveries: count, totalEarnings: DEMO_STATS.totalEarnings }
    } catch {
        return DEMO_STATS
    }
}

function mapRow(row: any): RiderOrder {
    return {
        id: row.id,
        orderNumber: row.order_number ?? `SYNC-${row.id.slice(0, 6).toUpperCase()}`,
        vendorName: row.vendor_name,
        vendorLogo: row.vendor_logo,
        deliveryAddress: row.delivery_address,
        items: row.items ?? [],
        total: row.total,
        status: row.status,
        etaMinutes: row.eta_minutes,
        createdAt: row.created_at,
        riderId: row.rider_id,
    }
}
export async function getActiveOrders(riderId: string): Promise<RiderOrder[]> {
    try {
        const supabase = await createClient()
        const { data, error } = await supabase
            .from('orders')
            .select('id, vendor_name, vendor_logo, delivery_address, items, total, status, eta_minutes, created_at, rider_id')
            .eq('rider_id', riderId)
            .neq('status', 'delivered')
            .order('created_at', { ascending: false })

        if (error || !data) return [DEMO_ACTIVE_ORDER]
        return data.map(mapRow)
    } catch {
        return [DEMO_ACTIVE_ORDER]
    }
}
const DEMO_CUSTOMER_NAMES = ['Tobi A.', 'Chiamaka O.', 'David E.', 'Zainab M.', 'Kelvin U.']

function withDemoHistoryFields(order: RiderOrder, index: number): RiderOrder {
    const isDelivered = order.status === 'delivered'
    const base = Math.round(order.total * 0.7)
    const tip = isDelivered ? Math.round(order.total * 0.1) : 0
    const bonus = isDelivered && index % 4 === 0 ? 200 : 0

    return {
        ...order,
        customerName: order.customerName ?? DEMO_CUSTOMER_NAMES[index % DEMO_CUSTOMER_NAMES.length],
        customerRating: isDelivered ? (order.customerRating ?? Math.round((4 + Math.random()) * 10) / 10) : null,
        earningsBreakdown: isDelivered ? { base, tip, bonus } : undefined,
    }
}

export async function getOrderHistory(riderId: string): Promise<RiderOrder[]> {
    try {
        const supabase = await createClient()
        const { data, error } = await supabase
            .from('orders')
            .select('id, vendor_name, vendor_logo, delivery_address, items, total, status, eta_minutes, created_at, rider_id')
            .eq('rider_id', riderId)
            .in('status', ['delivered', 'cancelled', 'failed'])
            .order('created_at', { ascending: false })

        const rows = (error || !data) ? DEMO_RECENT_ORDERS : data.map(mapRow)
        return rows.map(withDemoHistoryFields)
    } catch {
        return DEMO_RECENT_ORDERS.map(withDemoHistoryFields)
    }
}

export async function getEarningsSummary(riderId: string): Promise<EarningsSummary> {
    try {
        // No earnings-tracking columns/tables exist yet (base fare, tips, bonuses,
        // payouts aren't modeled in the schema) — always demo until that's built.
        throw new Error('not implemented')
    } catch {
        return DEMO_EARNINGS_SUMMARY
    }
}

export async function getEarningsHistory(riderId: string): Promise<EarningsEntry[]> {
    try {
        throw new Error('not implemented')
    } catch {
        return DEMO_EARNINGS_HISTORY
    }
}