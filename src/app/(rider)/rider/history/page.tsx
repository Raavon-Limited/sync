import { getOrderHistory } from '@/lib/rider/queries'
import { createClient } from '@/lib/supabase/server'
import { HistoryList } from '@/components/rider-comps/history-list'

const BYPASS_AUTH_FOR_PREVIEW = true // keep in sync with layout.tsx

export default async function HistoryPage() {
    let userId = 'demo-rider'

    if (!BYPASS_AUTH_FOR_PREVIEW) {
        const supabase = await createClient()
        const { data: { user } } = await supabase.auth.getUser()
        userId = user!.id
    }

    const orders = await getOrderHistory(userId)

    return (
        <div className="flex flex-col gap-6">
            <div>
                <p className="eyebrow text-content-muted">RIDER . HISTORY</p>
                <h1 className="text-2xl font-black text-content">History</h1>
                <p className="text-sm text-content-muted mt-1">
                    All your past deliveries, in one place.
                </p>
            </div>

            <HistoryList orders={orders} />
        </div>
    )
}