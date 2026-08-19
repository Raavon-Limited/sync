import { MapPin, Clock, Wallet } from 'lucide-react'
import type { RiderOrder } from '@/lib/rider/types'

export function AvailableOrderList({ orders }: { orders: RiderOrder[] }) {
    if (orders.length === 0) {
        return (
            <div className="rounded-xl border border-dashed border-line/20 px-5 py-12 text-center text-content-muted text-sm">
                No available jobs right now. Stay online to receive new orders.
            </div>
        )
    }

    return (
        <div className="flex flex-col gap-3">
            {orders.map((order) => (
                <div
                    key={order.id}
                    className="rounded-xl border border-line/15 bg-panel shadow-xs p-5 flex flex-col gap-4"
                >
                    <div className="flex items-start justify-between gap-4">
                        <div className="flex flex-col gap-1">
                            <span className="text-xs font-medium text-content-muted">#{order.id}</span>
                            <p className="font-semibold text-content text-base leading-tight">
                                {order.vendorName} <span className="text-content-muted font-normal">→</span> {order.deliveryAddress}
                            </p>
                        </div>

                        <span className="shrink-0 rounded-lg bg-lime/10 border border-lime/20 h-9 w-9 flex items-center justify-center">
                            <MapPin size={15} className="text-lime-deep dark:text-lime" />
                        </span>
                    </div>

                    <div className="flex items-center gap-4 text-sm">
                        <span className="inline-flex items-center gap-1.5 text-content-muted">
                            <Clock size={14} />
                            {order.etaMinutes} min
                        </span>
                        <span className="h-1 w-1 rounded-full bg-content-muted/40" />
                        <span className="inline-flex items-center gap-1.5 font-semibold text-content">
                            <Wallet size={14} />
                            ₦{order.total.toLocaleString()}
                        </span>
                    </div>

                    <div className="flex gap-2 pt-1">
                        <button className="flex-1 rounded-lg border border-line/15 py-2.5 text-sm font-medium text-content hover:bg-content-muted/5 transition-colors">
                            Reject
                        </button>
                        <button className="flex-1 rounded-lg bg-lime text-ink py-2.5 text-sm font-semibold hover:brightness-95 transition-all">
                            Accept
                        </button>
                    </div>
                </div>
            ))}
        </div>
    )
}