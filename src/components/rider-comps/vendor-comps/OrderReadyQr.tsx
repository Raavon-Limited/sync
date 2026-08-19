// components/rider-comps/vendor-comps/OrderReadyQr.tsx
'use client'
import QRCode from 'react-qr-code'
import { Store, MapPin, Clock } from 'lucide-react'

interface Props {
    orderId: string
    pickupToken: string
    vendorName: string
    itemsSummary: string
    total: number
    prepTimeMinutes: number
}

export function OrderReadyQr({ orderId, pickupToken, vendorName, itemsSummary, total, prepTimeMinutes }: Props) {
    const payload = JSON.stringify({ orderId, token: pickupToken })

    return (
        <div className="w-full max-w-sm rounded-2xl border border-line/15 bg-panel shadow-xs overflow-hidden">
            {/* Accent bar, matches active order cards in the rider app */}
            <div className="h-1.5 w-full bg-lime" />

            <div className="p-6 flex flex-col items-center gap-5">
                <div className="flex flex-col items-center gap-1.5 text-center">
                    <div className="w-10 h-10 rounded-full bg-lime/10 border border-lime/20 flex items-center justify-center mb-1">
                        <Store size={18} className="text-lime-deep dark:text-lime" />
                    </div>
                    <p className="font-black text-content text-lg">Order Ready for Pickup</p>
                    <p className="text-sm text-content-muted">Show this to your rider</p>
                </div>

                <div className="w-full rounded-xl bg-surface border border-line/10 p-4 flex flex-col gap-2.5">
                    <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold text-content-muted uppercase tracking-wide">Vendor</span>
                        <span className="text-sm font-semibold text-content">{vendorName}</span>
                    </div>
                    <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold text-content-muted uppercase tracking-wide">Items</span>
                        <span className="text-sm text-content text-right">{itemsSummary}</span>
                    </div>
                    <div className="flex items-center justify-between pt-2 border-t border-line/10">
                        <span className="text-xs font-semibold text-content-muted uppercase tracking-wide">Total</span>
                        <span className="text-sm font-bold text-content">₦{total.toLocaleString()}</span>
                    </div>
                </div>

                <div className="p-4 bg-white rounded-2xl border-2 border-black">
                    <QRCode value={payload} size={190} />
                </div>

                <div className="flex items-center gap-1.5 text-xs text-content-muted">
                    <Clock size={13} />
                    Prepared in {prepTimeMinutes} min
                </div>

                <p className="text-xs font-mono text-content-muted">#{orderId}</p>
            </div>
        </div>
    )
}