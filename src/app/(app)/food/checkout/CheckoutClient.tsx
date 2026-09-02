"use client"

import { useState, useRef } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useCart, useCartId } from "@/app/(app)/food/cart-context"
import { useCheckout } from "@/modules/food/hooks"
import { usePayOrderFromWallet } from "@/modules/payments/hooks"
import { useWallet } from "@/modules/payments/hooks"

import CheckoutHeader from "./components/checkoutHeader"
import OrderItems from "./components/OrderItems"
import DeliveryAddress, { type DeliveryAddressData } from "./components/DeliveryAddress"
import AllergyCard from "./components/AllergyCard"
import PaymentMethod, { type PaymentType } from "./components/PaymentMethod"
import CheckoutSummary, { type CheckoutItem } from "./components/CheckoutSummary"
import DeliveryOptions, { type DeliveryType } from "./components/DeliveryOptions"

const SYNC_FEE = 150
const DELIVERY_FEE = 300
const PACKAGING_FEE = 100

export default function CheckoutClient() {
    const router = useRouter()

    const { vendor, items, subtotal } = useCart()
    const cartId = useCartId()
    const checkout = useCheckout(vendor?.id ?? "")
    const payOrder = usePayOrderFromWallet()
    const { data: wallet } = useWallet()
    const [error, setError] = useState<string | null>(null)

    const [addressData, setAddressData] = useState<DeliveryAddressData>({
        address: "",
        building: "",
        instructions: "",
        phone: "",
        sendToSomeoneElse: false,
        recipientName: "",
        recipientPhone: "",
    })
    const [allergies, setAllergies] = useState("")
    const [deliveryOption, setDeliveryOption] = useState<DeliveryType>("standard")
    const [payment, setPayment] = useState<PaymentType>("cash")
    const [loading, setLoading] = useState(false)

    const placingRef = useRef(false)

    const total = subtotal + DELIVERY_FEE + PACKAGING_FEE + SYNC_FEE

    const checkoutItems: CheckoutItem[] = items.map(item => ({
        id: item.id,
        name: item.name,
        image: item.image,
        qty: item.qty,
        price: item.price,
    }))

    async function placeOrder() {
        if (items.length === 0 || placingRef.current) return
        if (!cartId) {
            setError("Your cart is still loading. Try again in a moment.")
            return
        }
        placingRef.current = true
        setLoading(true)
        setError(null)

        try {
            // checkout_cart is one transaction: it re-prices every line against
            // the live listing, creates the order, and consumes the cart. The
            // fees shown above are display-only   the RPC returns the total
            // that was actually charged, which is the one that counts.
            const result = await checkout.mutateAsync({
                cartId,
                deliveryAddress: addressData.address || "Tanke Crescent, Behind Tanke Lodge, Ilorin",
                note: allergies || undefined,
            })

            // `repriced` means a listing's price moved between adding to cart
            // and paying. The order is correct; the student should know why the
            // number differs from what they saw.
            if (result.repriced) {
                console.warn(`Order ${result.orderId} was repriced at checkout`)
            }

            // PAY IS A SECOND STEP, ON PURPOSE.
            // checkout_cart creates the order and consumes the cart; paying is
            // a separate transaction so a payment failure leaves a real,
            // recoverable order rather than losing the cart AND the money.
            try {
                await payOrder.mutateAsync(result.orderId)
            } catch (payErr) {
                // The order exists and is unpaid. Send them to it rather than
                // stranding them on a checkout page with an emptied cart  
                // insufficient balance is the common case and is fixable.
                const reason = payErr instanceof Error ? payErr.message : "Payment failed"
                router.push(
                    `/food/orders/${result.orderId}/track?unpaid=1&reason=${encodeURIComponent(reason)}`,
                )
                return
            }

            router.push(`/food/orders/${result.orderId}/track`)
        } catch (e) {
            setError(e instanceof Error ? e.message : "Could not place your order")
            placingRef.current = false
            setLoading(false)
        }
    }

    return (
        <div className="mx-auto max-w-7xl px-4 sm:px-6">

            <CheckoutHeader />

            {error && (
                <p className="text-coral border-coral/30 bg-coral/5 mt-3 rounded-lg border px-3 py-2 text-sm">
                    {error}
                </p>
            )}

            {/* Orders are paid from wallet balance, so a shortfall is worth
                showing BEFORE they tap pay   afterwards the cart is gone and
                the order is sitting unpaid. */}
            {wallet && total * 100 > wallet.balanceKobo && (
                <p className="border-line/10 bg-panel mt-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border px-3 py-2 text-sm">
                    <span className="text-content-muted">
                        Wallet balance ₦{(wallet.balanceKobo / 100).toLocaleString()}   you need{' '}
                        <span className="text-content font-medium">
                            ₦{(total - wallet.balanceKobo / 100).toLocaleString()}
                        </span>{' '}
                        more.
                    </span>
                    <Link href="/user/wallet" className="text-lime-deep font-medium underline underline-offset-2">
                        Top up
                    </Link>
                </p>
            )}

            <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_380px]">

                {/* ── LEFT COLUMN ── */}
                <div className="space-y-6">

                    <OrderItems
                        vendorName={vendor?.name ?? ""}
                        items={checkoutItems}
                    />

                    <AllergyCard
                        value={allergies}
                        onChange={setAllergies}
                    />

                    <DeliveryAddress
                        value={addressData}
                        onChange={setAddressData}
                    />

                    <DeliveryOptions
                        value={deliveryOption}
                        onChange={setDeliveryOption}
                    />

                    <PaymentMethod
                        value={payment}
                        onChange={setPayment}
                    />

                </div>

                {/* ── RIGHT COLUMN (desktop) ── */}
                <div className="hidden lg:block">
                    <CheckoutSummary
                        vendorName={vendor?.name ?? ""}
                        items={checkoutItems}
                        deliveryFee={DELIVERY_FEE}
                        packagingFee={PACKAGING_FEE}
                        serviceFee={SYNC_FEE}
                        loading={loading}
                        onPlaceOrder={placeOrder}
                    />
                </div>

            </div>

            {/* ── MOBILE sticky summary ── */}
            <div className="lg:hidden fixed bottom-0 inset-x-0 z-40 border-t border-line/10 bg-panel/95 backdrop-blur">
                <div className="px-4 py-4">
                    <CheckoutSummary
                        vendorName={vendor?.name ?? ""}
                        items={checkoutItems}
                        deliveryFee={DELIVERY_FEE}
                        packagingFee={PACKAGING_FEE}
                        serviceFee={SYNC_FEE}
                        loading={loading}
                        onPlaceOrder={placeOrder}
                    />
                </div>
            </div>

        </div>
    )
}