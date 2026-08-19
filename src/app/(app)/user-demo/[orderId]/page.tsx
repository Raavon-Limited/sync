'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { DeliveryConfirmQr } from '@/components/food-comps/DeliveryConfirmQr'
import { ensureDemoTokens } from '@/lib/rider/demo-tokens'

export default function StudentQrDemoPage() {
    const { orderId } = useParams<{ orderId: string }>()
    const [token, setToken] = useState<string | null>(null)

    useEffect(() => {
        const tokens = ensureDemoTokens(orderId)
        setToken(tokens.deliveryToken)
    }, [orderId])

    if (!token) return null

    return (
        <div className="min-h-screen flex items-center justify-center bg-surface p-6">
            <DeliveryConfirmQr
                orderId={orderId}
                deliveryToken={token}
                riderName="Demo Rider"
                deliveryAddress="Hostel B, Block 3, Room 214"
            />
        </div>
    )
}