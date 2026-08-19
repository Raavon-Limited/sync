'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import crypto from 'crypto'

export async function acceptOrder(orderId: string) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) return { error: 'Not authenticated' }


    const pickupToken = crypto.randomUUID()
    const expiresAt = new Date(Date.now() + 60 * 60_000).toISOString()

    const { error } = await supabase
        .from('orders')
        .update({
            rider_id: user.id,
            status: 'rider_assigned',
            pickup_token: pickupToken,
            pickup_token_expires_at: expiresAt,
        })
        .eq('id', orderId)
        .is('rider_id', null)

    if (error) return { error: error.message }

    revalidatePath('/rider')
    return { success: true }
}
export async function confirmPickup(orderId: string, scannedToken: string) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { error: 'Not authenticated' }

    const { data: order, error: fetchError } = await supabase
        .from('orders')
        .select('pickup_token, pickup_token_expires_at, rider_id, status')
        .eq('id', orderId)
        .maybeSingle()

    if (fetchError || !order) return { error: 'Order not found' }
    if (order.rider_id !== user.id) return { error: 'Not your order' }
    if (order.status !== 'rider_assigned') return { error: 'Order is not awaiting pickup' }
    if (order.pickup_token !== scannedToken) return { error: 'Invalid QR code' }
    if (order.pickup_token_expires_at && new Date(order.pickup_token_expires_at) < new Date()) {
        return { error: 'QR code expired — ask the vendor to regenerate it' }
    }

    // Generate the delivery token now, since it's shown on the student's
    // tracking page as soon as the order flips to picked_up.
    const deliveryToken = crypto.randomUUID()
    const expiresAt = new Date(Date.now() + 90 * 60_000).toISOString() // 90min window

    const { error } = await supabase
        .from('orders')
        .update({
            status: 'picked_up',
            picked_up_at: new Date().toISOString(),
            delivery_token: deliveryToken,
            delivery_token_expires_at: expiresAt,
        })
        .eq('id', orderId)

    if (error) return { error: error.message }

    revalidatePath(`/rider/orders/${orderId}`)
    revalidatePath('/rider')
    return { success: true }
}

export async function confirmDelivery(orderId: string, scannedToken: string) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { error: 'Not authenticated' }

    const { data: order, error: fetchError } = await supabase
        .from('orders')
        .select('delivery_token, delivery_token_expires_at, rider_id, status')
        .eq('id', orderId)
        .maybeSingle()

    if (fetchError || !order) return { error: 'Order not found' }
    if (order.rider_id !== user.id) return { error: 'Not your order' }
    if (order.status !== 'picked_up' && order.status !== 'on_the_way') {
        return { error: 'Order is not out for delivery' }
    }
    if (order.delivery_token !== scannedToken) return { error: 'Invalid QR code' }
    if (order.delivery_token_expires_at && new Date(order.delivery_token_expires_at) < new Date()) {
        return { error: 'QR code expired' }
    }

    const { error } = await supabase
        .from('orders')
        .update({ status: 'delivered', delivered_at: new Date().toISOString() })
        .eq('id', orderId)

    if (error) return { error: error.message }

    revalidatePath(`/rider/orders/${orderId}`)
    revalidatePath('/rider')
    revalidatePath('/rider/history')
    return { success: true }
}