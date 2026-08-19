import { Navigation, Phone, Clock, MapPin, Package, QrCode } from 'lucide-react'
import type { RiderOrder } from '@/lib/rider/types'
import { QrScannerButton } from './qr-scanner-button'
// import { confirmPickup, confirmDelivery } from '@/app/(app)/rider/action'
import { confirmDemoPickup, confirmDemoDelivery } from '@/lib/rider/demo-tokens'

const STATUS_CONFIG: Partial<Record<RiderOrder['status'], { label: string; dot: string; badge: string }>> = {
    preparing: { label: 'Preparing', dot: 'bg-orange-500', badge: 'border-orange-500/20 text-orange-700 dark:text-orange-400 bg-orange-500/10' },
    rider_assigned: { label: 'Head to vendor', dot: 'bg-blue-500', badge: 'border-blue-500/20 text-blue-700 dark:text-blue-400 bg-blue-500/10' },
    picked_up: { label: 'Picked up', dot: 'bg-purple-500', badge: 'border-purple-500/20 text-purple-700 dark:text-purple-400 bg-purple-500/10' },
    on_the_way: { label: 'On the way', dot: 'bg-green-500', badge: 'border-green-500/20 text-green-700 dark:text-green-400 bg-green-500/10' },
    delivered: { label: 'Delivered', dot: 'bg-neutral-400', badge: 'border-neutral-400/20 text-neutral-600 dark:text-neutral-400 bg-neutral-400/10' },
}

const FALLBACK_STATUS = {
    label: 'Unknown',
    dot: 'bg-neutral-400',
    badge: 'border-neutral-400/20 text-neutral-600 dark:text-neutral-400 bg-neutral-400/10',
}

export function ActiveOrdersList({ orders }: { orders: RiderOrder[] }) {
    if (orders.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-line/20 px-5 py-16 text-center">
                <div className="w-11 h-11 rounded-full bg-lime/10 flex items-center justify-center">
                    <Package size={20} className="text-lime-deep dark:text-lime" />
                </div>
                <div>
                    <p className="font-semibold text-content text-sm">No active deliveries</p>
                    <p className="text-content-muted text-xs mt-0.5">New jobs will appear here</p>
                </div>
            </div>
        )
    }

    return (
        <div className="flex flex-col gap-3">
            {orders.map((order) => {
                const status = STATUS_CONFIG[order.status] ?? FALLBACK_STATUS

                // Which QR action to show depends on current status
                const showPickupScan = order.status === 'rider_assigned'
                const showDeliveryScan = order.status === 'picked_up' || order.status === 'on_the_way'

                return (
                    <div
                        key={order.id}
                        className="rounded-xl border border-line/15 bg-panel shadow-xs overflow-hidden"
                    >
                        {/* Lime accent bar */}
                        <div className="h-1 w-full bg-lime" />

                        <div className="p-5 flex flex-col gap-4">

                            {/* Header */}
                            <div className="flex items-start justify-between gap-3">
                                <div className="flex flex-col gap-2">
                                    <div className="flex items-center gap-2 flex-wrap">
                                        <span className={`inline-flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-1 rounded-full border ${status.badge}`}>
                                            <span className={`h-1.5 w-1.5 rounded-full ${status.dot}`} />
                                            {status.label}
                                        </span>
                                        <span className="text-[11px] font-mono text-content-muted bg-surface px-2 py-0.5 rounded-full border border-line/10">
                                            #{order.id}
                                        </span>
                                    </div>
                                    <p className="font-semibold text-content text-base leading-snug">
                                        {order.vendorName}
                                        <span className="text-lime-deep dark:text-lime font-semibold mx-1.5">→</span>
                                        <span className="font-medium">{order.deliveryAddress}</span>
                                    </p>
                                </div>

                                <div className="shrink-0 w-9 h-9 rounded-lg bg-lime/10 border border-lime/20 flex items-center justify-center">
                                    <MapPin size={15} className="text-lime-deep dark:text-lime" />
                                </div>
                            </div>

                            {/* Meta row */}
                            <div className="flex items-center gap-3 px-3 py-2.5 rounded-lg bg-surface border border-line/10">
                                <span className="inline-flex items-center gap-1.5 text-xs text-content-muted">
                                    <Clock size={13} className="text-lime-deep dark:text-lime" />
                                    ETA {order.etaMinutes} min
                                </span>
                                <span className="h-3 w-px bg-line/20" />
                                <span className="text-xs font-semibold text-content">
                                    ₦{order.total.toLocaleString()}
                                </span>
                            </div>

                            {/* Action buttons */}
                            <div className="flex flex-col gap-2">

                                {/* Navigate + Call always visible */}
                                <div className="grid grid-cols-2 gap-2">
                                    <button className="flex items-center justify-center gap-1.5 rounded-lg border border-line/15 bg-surface py-2.5 text-xs font-semibold text-content hover:border-lime/50 hover:text-lime-deep dark:hover:text-lime hover:bg-lime/5 transition-colors">
                                        <Navigation size={13} />
                                        Navigate
                                    </button>
                                    <button className="flex items-center justify-center gap-1.5 rounded-lg border border-line/15 bg-surface py-2.5 text-xs font-semibold text-content hover:border-lime/50 hover:text-lime-deep dark:hover:text-lime hover:bg-lime/5 transition-colors">
                                        <Phone size={13} />
                                        Call
                                    </button>
                                </div>

                                {/* Scan to confirm pickup — shown when rider is heading to vendor */}
                                {showPickupScan && (
                                    <QrScannerButton
                                        orderId={order.id}
                                        label="Scan to confirm pickup"
                                        // onScan={confirmPickup}
                                        onScan={async (id, token) => confirmDemoPickup(id, token)}
                                    />
                                )}
    
                                {/* Scan to confirm delivery — shown when order is on the way */}
                                {showDeliveryScan && (
                                    <QrScannerButton
                                        orderId={order.id}
                                        label="Scan to confirm delivery"
                                        onScan={async (id, token) => confirmDemoDelivery(id, token)}
                                    />
                                )}

                                {/* Preparing state — waiting for vendor, no scan yet */}
                                {order.status === 'preparing' && (
                                    <div className="flex items-center justify-center gap-2 rounded-lg border border-line/10 bg-surface px-4 py-2.5">
                                        <QrCode size={13} className="text-content-muted" />
                                        <p className="text-xs text-content-muted font-medium">
                                            Waiting for vendor to confirm order is ready
                                        </p>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                )
            })}
        </div>
    )
}