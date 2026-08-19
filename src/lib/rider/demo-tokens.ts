'use client'

// Demo-only "database" for QR tokens, backed by localStorage so the vendor
// page, rider scanner, and student page can all agree on the same token
// without a real backend. Replace with real Supabase columns later —
// same shape (pickup_token / delivery_token) as the schema we already wrote.

interface DemoOrderTokens {
    pickupToken: string
    deliveryToken: string
    status: 'rider_assigned' | 'picked_up' | 'on_the_way' | 'delivered'
}

const STORAGE_KEY = 'demo_order_tokens'

function readAll(): Record<string, DemoOrderTokens> {
    if (typeof window === 'undefined') return {}
    try {
        return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}')
    } catch {
        return {}
    }
}

function writeAll(data: Record<string, DemoOrderTokens>) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
}

// Called once per order to seed both tokens up front (in the real system
// pickup_token exists from creation, delivery_token gets generated after
// pickup — but for demo purposes it's simpler to have both ready).
export function ensureDemoTokens(orderId: string): DemoOrderTokens {
    const all = readAll()
    if (!all[orderId]) {
        all[orderId] = {
            pickupToken: crypto.randomUUID(),
            deliveryToken: crypto.randomUUID(),
            status: 'rider_assigned',
        }
        writeAll(all)
    }
    return all[orderId]
}

export function getDemoTokens(orderId: string): DemoOrderTokens | null {
    return readAll()[orderId] ?? null
}

export function confirmDemoPickup(orderId: string, scannedToken: string): { success?: boolean; error?: string } {
    const all = readAll()
    const record = all[orderId]
    if (!record) return { error: 'Order not found' }
    if (record.status !== 'rider_assigned') return { error: 'Order is not awaiting pickup' }
    if (record.pickupToken !== scannedToken) return { error: 'Invalid QR code' }

    record.status = 'picked_up'
    writeAll(all)
    return { success: true }
}

export function confirmDemoDelivery(orderId: string, scannedToken: string): { success?: boolean; error?: string } {
    const all = readAll()
    const record = all[orderId]
    if (!record) return { error: 'Order not found' }
    if (record.status !== 'picked_up' && record.status !== 'on_the_way') return { error: 'Order is not out for delivery' }
    if (record.deliveryToken !== scannedToken) return { error: 'Invalid QR code' }

    record.status = 'delivered'
    writeAll(all)
    return { success: true }
}