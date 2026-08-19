// components/food-comps/DeliveryConfirmQr.tsx
'use client'
import QRCode from 'react-qr-code'
import { Bike, MapPin } from 'lucide-react'

interface Props {
    orderId: string
    deliveryToken: string
    riderName: string
    deliveryAddress: string
}

export function DeliveryConfirmQr({ orderId, deliveryToken, riderName, deliveryAddress }: Props) {
    const payload = JSON.stringify({ orderId, token: deliveryToken })

    return (
        <div className="w-full max-w-sm rounded-2xl border border-line/15 bg-panel shadow-xs overflow-hidden">
            <div className="h-1.5 w-full bg-lime" />

            <div className="p-6 flex flex-col items-center gap-5">
                <div className="flex flex-col items-center gap-1.5 text-center">
                    <div className="w-10 h-10 rounded-full bg-lime/10 border border-lime/20 flex items-center justify-center mb-1">
                        <Bike size={18} className="text-lime-deep dark:text-lime" />
                    </div>
                    <p className="font-black text-content text-lg">Confirm Your Delivery</p>
                    <p className="text-sm text-content-muted">Show this to your rider</p>
                </div>

                <div className="w-full rounded-xl bg-surface border border-line/10 p-4 flex flex-col gap-2.5">
                    <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold text-content-muted uppercase tracking-wide">Rider</span>
                        <span className="text-sm font-semibold text-content">{riderName}</span>
                    </div>
                    <div className="flex items-start justify-between gap-3">
                        <span className="text-xs font-semibold text-content-muted uppercase tracking-wide shrink-0">Deliver to</span>
                        <span className="text-sm text-content text-right flex items-center gap-1.5">
                            <MapPin size={13} className="text-lime-deep dark:text-lime shrink-0" />
                            {deliveryAddress}
                        </span>
                    </div>
                </div>

                <div className="p-4 bg-white rounded-2xl border-2 border-black">
                    <QRCode value={payload} size={190} />
                </div>

                <p className="text-xs font-mono text-content-muted">#{orderId}</p>
            </div>
        </div>
    )
}