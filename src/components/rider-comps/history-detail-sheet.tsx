// components/rider-comps/history-detail-sheet.tsx
'use client'

import { X, Star, Flag, MapPin, Clock, Wallet } from 'lucide-react'
import type { RiderOrder } from '@/lib/rider/types'

export function HistoryDetailSheet({
    order,
    onClose,
}: {
    order: RiderOrder | null
    onClose: () => void
}) {
    if (!order) return null

    const date = new Date(order.createdAt)

    return (
        <div
            className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-[2px]"
            onClick={onClose}
        >
            <div
                onClick={(e) => e.stopPropagation()}
                className="w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl border border-line/15 bg-panel shadow-xl p-6 flex flex-col gap-6 max-h-[88vh] overflow-y-auto"
            >
                {/* Header */}
                <div className="flex items-start justify-between gap-3">
                    <div>
                        <p className="text-xs font-medium text-content-muted font-mono">
                            #{order.id}
                        </p>
                        <p className="font-semibold text-content text-lg mt-0.5">
                            {order.vendorName}
                        </p>
                        <p className="text-sm text-content-muted mt-0.5 flex items-center gap-1.5">
                            <MapPin size={13} />
                            {order.deliveryAddress}
                        </p>
                    </div>
                    <button
                        onClick={onClose}
                        className="rounded-full border border-line/15 h-8 w-8 flex items-center justify-center shrink-0 hover:bg-content-muted/5 transition-colors"
                    >
                        <X size={14} />
                    </button>
                </div>

                {/* Timeline */}
                <div>
                    <p className="text-[11px] font-semibold uppercase tracking-widest text-content-muted mb-3 flex items-center gap-1.5">
                        <Clock size={12} />
                        Timeline
                    </p>
                    <div className="space-y-3 text-sm">
                        <div className="flex justify-between gap-4">
                            <span className="text-content-muted">Order placed</span>
                            <span className="font-medium text-content text-right">
                                {date.toLocaleDateString('en-NG', {
                                    day: 'numeric',
                                    month: 'short',
                                })}{' '}
                                ·{' '}
                                {date.toLocaleTimeString([], {
                                    hour: '2-digit',
                                    minute: '2-digit',
                                })}
                            </span>
                        </div>
                        <div className="flex justify-between gap-4">
                            <span className="text-content-muted">Delivered to</span>
                            <span className="font-medium text-content text-right max-w-[60%]">
                                {order.deliveryAddress}
                            </span>
                        </div>
                        {order.customerName && (
                            <div className="flex justify-between gap-4">
                                <span className="text-content-muted">Customer</span>
                                <span className="font-medium text-content text-right">
                                    {order.customerName}
                                </span>
                            </div>
                        )}
                    </div>
                </div>

                {/* Customer rating */}
                {order.customerRating != null && (
                    <div>
                        <p className="text-[11px] font-semibold uppercase tracking-widest text-content-muted mb-2">
                            Customer rating
                        </p>
                        <div className="flex items-center gap-2">
                            <div className="flex items-center gap-1">
                                <Star size={16} className="fill-yellow-400 text-yellow-400" />
                                <span className="font-semibold text-content text-base">
                                    {order.customerRating.toFixed(1)}
                                </span>
                            </div>
                            {order.customerName && (
                                <span className="text-sm text-content-muted">
                                    from {order.customerName}
                                </span>
                            )}
                        </div>
                    </div>
                )}

                {/* Earnings breakdown */}
                {order.earningsBreakdown ? (
                    <div>
                        <p className="text-[11px] font-semibold uppercase tracking-widest text-content-muted mb-3 flex items-center gap-1.5">
                            <Wallet size={12} />
                            Earnings breakdown
                        </p>
                        <div className="rounded-xl bg-content-muted/5 px-4 py-3 space-y-2 text-sm">
                            <div className="flex justify-between">
                                <span className="text-content-muted">Base pay</span>
                                <span className="text-content">
                                    ₦{order.earningsBreakdown.base.toLocaleString()}
                                </span>
                            </div>
                            <div className="flex justify-between">
                                <span className="text-content-muted">Tip</span>
                                <span className="text-content">
                                    ₦{order.earningsBreakdown.tip.toLocaleString()}
                                </span>
                            </div>
                            <div className="flex justify-between">
                                <span className="text-content-muted">Bonus</span>
                                <span className="text-content">
                                    ₦{order.earningsBreakdown.bonus.toLocaleString()}
                                </span>
                            </div>
                            <div className="flex justify-between font-semibold pt-2 border-t border-line/15 text-content">
                                <span>Total earned</span>
                                <span>₦{order.total.toLocaleString()}</span>
                            </div>
                        </div>
                    </div>
                ) : (
                    <div className="rounded-xl bg-content-muted/5 px-4 py-3 flex justify-between items-center">
                        <span className="text-sm text-content-muted">Total earned</span>
                        <span className="font-semibold text-content text-lg">
                            ₦{order.total.toLocaleString()}
                        </span>
                    </div>
                )}

                {/* Actions */}
                <div className="flex flex-col gap-2.5 pt-1">
                    <button className="flex items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-medium text-content transition-colors bg-lime shadow-[1px_1px_0px_0px_rgba(0,0,0,1)]">
                        <Flag size={14} />
                        Report an issue
                    </button>
                </div>
            </div>
        </div>
    )
}