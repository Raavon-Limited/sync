import { Wallet, ShoppingBag, Percent, CreditCard } from 'lucide-react'
import type { EarningsSummary } from '@/lib/rider/types'

export function EarningsStatCards({ summary }: { summary: EarningsSummary }) {
    const cards = [
        { label: 'Total earnings', value: `₦${summary.totalEarnings.toLocaleString()}`, change: summary.totalEarningsChangePercent, icon: Wallet, iconBg: 'bg-lime/15', iconColor: 'text-lime-deep dark:text-lime' },
        { label: 'Deliveries completed', value: summary.deliveriesCompleted, change: summary.deliveriesChangePercent, icon: ShoppingBag, iconBg: 'bg-orange-500/10', iconColor: 'text-orange-500' },
        { label: 'Avg. earnings / delivery', value: `₦${summary.avgPerDelivery.toLocaleString()}`, change: summary.avgChangePercent, icon: Percent, iconBg: 'bg-purple-500/10', iconColor: 'text-purple-500' },
        { label: 'Pending payout', value: `₦${summary.pendingPayout.toLocaleString()}`, note: `Next payout: ${summary.nextPayoutDate}`, icon: CreditCard, iconBg: 'bg-pink-500/10', iconColor: 'text-pink-500' },
    ]

    return (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
            {cards.map(c => (
                <div key={c.label} className="rounded-xl border border-line/15 bg-panel shadow-xs p-4 flex items-center gap-3">
                    <div className={`w-11 h-11 rounded-full flex items-center justify-center flex-shrink-0 ${c.iconBg}`}>
                        <c.icon size={18} className={c.iconColor} />
                    </div>
                    <div className="min-w-0">
                        <p className="text-xs text-content-muted truncate">{c.label}</p>
                        <p className="font-display text-xl font-bold text-content">{c.value}</p>
                        {c.change !== undefined && (
                            <p className="text-[11px] font-medium text-green-600 dark:text-green-400">
                                +{c.change}% <span className="text-content-muted">vs Apr 2026</span>
                            </p>
                        )}
                        {c.note && <p className="text-[11px] text-content-muted">{c.note}</p>}
                    </div>
                </div>
            ))}
        </div>
    )
}