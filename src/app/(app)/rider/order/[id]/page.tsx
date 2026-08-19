import { notFound } from 'next/navigation'
import { MapPin, Clock, Package } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { getOrderById } from '@/lib/rider/queries'
import { confirmPickup, confirmDelivery } from '@/app/(app)/rider/action'
import { QrScannerButton } from '@/components/rider-comps/qr-scanner-button'

export default async function RiderOrderDetail({ params }: { params: Promise<{ id: string }> }) {
    const { id } = await params
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    const order = await getOrderById(id, user!.id)
    if (!order) notFound()

    return (
        <div className="flex flex-col gap-5">
            <div>
                <p className="text-xs font-bold uppercase tracking-wide text-content-muted">
                    Order #{order.id.slice(0, 8)}
                </p>
                <h1 className="text-2xl font-black text-content">{order.vendorName}</h1>
            </div>

            <div className="rounded-2xl border border-line/10 bg-panel px-4 py-4">
                <div className="flex items-center gap-2 text-sm text-content">
                    <MapPin size={16} className="text-content-muted flex-shrink-0" />
                    {order.deliveryAddress}
                </div>
                <div className="mt-2 flex items-center gap-2 text-sm text-content-muted">
                    <Clock size={16} className="flex-shrink-0" />
                    {order.etaMinutes} min ETA
                </div>
            </div>

            <div className="rounded-2xl border border-line/10 bg-panel px-4 py-4">
                <p className="mb-2 flex items-center gap-2 text-sm font-semibold text-content">
                    <Package size={16} /> Items
                </p>
                <ul className="flex flex-col gap-1">
                    {order.items.map((item, i) => (
                        <li key={i} className="text-sm text-content-muted">
                            {item.qty}× {item.name}
                        </li>
                    ))}
                </ul>
                <p className="mt-3 text-sm font-bold text-content">Total: ₦{order.total.toLocaleString()}</p>
            </div>

            {/* Pickup step */}
            {order.status === 'rider_assigned' && (
                <QrScannerButton
                    orderId={order.id}
                    label="Scan vendor's QR to confirm pickup"
                    onScan={confirmPickup}
                />
            )}

            {/* Delivery step */}
            {(order.status === 'picked_up' || order.status === 'on_the_way') && (
                <QrScannerButton
                    orderId={order.id}
                    label="Scan student's QR to confirm delivery"
                    onScan={confirmDelivery}
                />
            )}

            {order.status === 'delivered' && (
                <p className="rounded-2xl bg-lime/10 px-4 py-4 text-center text-sm font-semibold text-lime-deep dark:text-lime">
                    Delivered ✓
                </p>
            )}
        </div>
    )
}