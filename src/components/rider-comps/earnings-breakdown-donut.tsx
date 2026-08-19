import type { EarningsBreakdownItem } from '@/lib/rider/types'

const COLOR_MAP: Record<string, string> = {
    'bg-lime-deep dark:bg-lime': '#65a30d',
    'bg-lime/50': '#a3e635',
    'bg-purple-400': '#c084fc',
    'bg-yellow-400': '#facc15',
}

export function EarningsBreakdownDonut({ total, items }: { total: number; items: EarningsBreakdownItem[] }) {
    let cumulative = 0
    const stops = items
        .map(item => {
            const start = cumulative
            cumulative += item.percent
            const color = COLOR_MAP[item.colorClass] ?? '#65a30d'
            return `${color} ${start}% ${cumulative}%`
        })
        .join(', ')

    return (
        <div className="flex items-center gap-4 w-full min-w-0">
            <div
                className="relative rounded-full flex-shrink-0"
                style={{
                    width: 110,
                    height: 110,
                    minWidth: 110,
                    minHeight: 110,
                    background: `conic-gradient(${stops})`,
                }}
            >
                <div
                    className="absolute rounded-full bg-panel flex flex-col items-center justify-center px-1 text-center"
                    style={{ inset: 10 }}
                >
                    <p className="text-sm font-black text-content leading-tight">₦{total.toLocaleString()}</p>
                    <p className="text-[9px] text-content-muted mt-0.5">Total</p>
                </div>
            </div>

            <div className="grid grid-cols-[auto_1fr_auto_auto] items-center gap-x-2 gap-y-2.5 min-w-0 flex-1">
                {items.map(item => (
                    <>
                        <span key={`dot-${item.label}`} className={`h-2 w-2 rounded-full shrink-0 ${item.colorClass}`} />
                        <span key={`label-${item.label}`} className="text-content text-sm truncate">{item.label}</span>
                        <span key={`amount-${item.label}`} className="font-medium text-content text-sm whitespace-nowrap">
                            ₦{item.amount.toLocaleString()}
                        </span>
                        <span key={`percent-${item.label}`} className="text-content-muted text-xs whitespace-nowrap text-right">
                            {item.percent}%
                        </span>
                    </>
                ))}
            </div>
        </div>
    )
}