'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { OrderReadyQr } from '@/components/rider-comps/vendor-comps/OrderReadyQr'
import { ensureDemoTokens } from '@/lib/rider/demo-tokens'

export default function VendorQrDemoPage() {
    const { orderId } = useParams<{ orderId: string }>()
    const [token, setToken] = useState<string | null>(null)

    useEffect(() => {
        const tokens = ensureDemoTokens(orderId)
        setToken(tokens.pickupToken)
    }, [orderId])

    if (!token) return null

    return (
        <div className="min-h-screen flex items-center justify-center bg-surface p-6">
            <OrderReadyQr
                orderId={orderId}
                pickupToken={token}
                vendorName="Mama Put Tanke"
                itemsSummary="Jollof rice, Grilled chicken, Coke"
                total={3200}
                prepTimeMinutes={12}
            />
        </div>
    )
}