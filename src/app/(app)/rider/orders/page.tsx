import { getActiveOrders, getAvailableOrders } from '@/lib/rider/queries'
import { createClient } from '@/lib/supabase/server'
import { OrderTabs } from '@/components/rider-comps/order-tabs'

const BYPASS_AUTH_FOR_PREVIEW = true // keep in sync with layout.tsx

export default async function OrdersPage() {
    let userId = 'demo-rider'

    if (!BYPASS_AUTH_FOR_PREVIEW) {
        const supabase = await createClient()
        const { data: { user } } = await supabase.auth.getUser()
        userId = user!.id
    }

    const [activeOrders, availableOrders] = await Promise.all([
        getActiveOrders(userId),
        getAvailableOrders(),
    ])

    return (
        <div className="flex flex-col gap-6">
            <div>
                <p className="eyebrow text-content-muted">RIDER . ORDERS</p>
                <h1 className="text-2xl font-black text-content">Orders</h1>
                <p className="text-sm text-content-muted mt-1">
                    Manage your active jobs and browse new ones.
                </p>
            </div>

            <OrderTabs active={activeOrders} available={availableOrders} />
        </div>
    )
}