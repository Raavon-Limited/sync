import Link from 'next/link'
import { MapPin, Phone, Navigation2, AlertCircle, Hash, Clock } from 'lucide-react'
import type { RiderOrder } from '@/lib/rider/types'

const STATUS_LABEL: Record<RiderOrder['status'], string> = {
    preparing: 'Waiting on vendor',
    rider_assigned: 'Head to vendor for pickup',
    picked_up: 'Picked up — deliver now',
    on_the_way: 'On the way to customer',
    delivered: 'Delivered',
    cancelled: 'Cancelled',
    failed: 'Failed',
}

export function ActiveJobCard({ order }: { order: RiderOrder }) {
    const isPickupPhase = order.status === 'rider_assigned'
    const contactPhone = isPickupPhase ? order.vendorPhone : order.studentPhone
    const contactLabel = isPickupPhase ? 'Call vendor' : 'Call customer'

    return (
        <div className="rounded-2xl border-2 border-black bg-lime shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] overflow-hidden">
            <div className="px-5 py-5">
                <div className="flex items-center justify-between gap-2">
                    <span className="inline-flex items-center gap-1 rounded-full bg-ink text-cream px-2.5 py-1 text-[11px] font-bold">
                        {STATUS_LABEL[order.status]}
                    </span>
                    <span className="flex items-center gap-1 text-[11px] font-semibold text-ink/70">
                        <Hash size={12} /> {order.orderNumber}
                    </span>
                </div>

                <p className="mt-3 text-xl font-black text-ink">{order.vendorName}</p>

                <div className="mt-2 flex items-center gap-1.5 text-sm text-ink/80">
                    <MapPin size={14} className="flex-shrink-0" />
                    {order.deliveryAddress}
                </div>

                <div className="mt-1 flex items-center gap-4 text-xs font-semibold text-ink/70">
                    <span className="flex items-center gap-1">
                        <Clock size={12} /> {order.etaMinutes} min
                    </span>
                    {order.distanceKm !== undefined && (
                        <span className="flex items-center gap-1">
                            <Navigation2 size={12} /> {order.distanceKm} km
                        </span>
                    )}
                </div>

                <div className="mt-3 h-28 rounded-xl border border-black/20 bg-ink/5 flex items-center justify-center">
                    <p className="text-xs text-ink/50">Map preview</p>
                </div>

                <div className="mt-4 grid grid-cols-2 gap-2">
                    <a
                        href={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(order.deliveryAddress)}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center justify-center gap-1.5 rounded-xl bg-ink text-cream text-xs font-bold py-2.5"
                    >
                        <Navigation2 size={14} /> Navigate
                    </a>
                    {contactPhone ? (
                        <a
                            href={`tel:${contactPhone}`}
                            className="flex items-center justify-center gap-1.5 rounded-xl bg-white/90 text-ink text-xs font-bold py-2.5"
                        >
                            <Phone size={14} /> {contactLabel}
                        </a>
                    ) : (
                        <button
                            type="button"
                            disabled
                            className="flex items-center justify-center gap-1.5 rounded-xl bg-white/50 text-ink/40 text-xs font-bold py-2.5"
                        >
                            <Phone size={14} /> No number
                        </button>
                    )}
                </div>

                <Link
                    href={`/rider/orders/${order.id}`}
                    className="mt-2 block text-center text-xs font-bold text-ink underline underline-offset-2"
                >
                    Open full order — scan QR to {isPickupPhase ? 'confirm pickup' : 'confirm delivery'}
                </Link>

                <button
                    type="button"
                    className="mt-2 flex w-full items-center justify-center gap-1.5 text-xs font-semibold text-ink/60"
                >
                    <AlertCircle size={13} /> Report an issue
                </button>
            </div >
        </div >
    )
}