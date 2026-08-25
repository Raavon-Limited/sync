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
        <div className="flex flex-col h-full w-full min-w-0">
            {/* Donut grows and fills all available height */}
            <div className="flex items-center justify-center flex-1 min-h-0">
                <div
                    className="relative rounded-full flex-shrink-0"
                    style={{
                        width: 170,
                        height: 170,
                        background: `conic-gradient(${stops})`,
                    }}
                >
                    <div
                        className="absolute rounded-full bg-panel flex flex-col items-center justify-center px-1 text-center"
                        style={{ inset: 16 }}
                    >
                        <p className="text-xl font-black text-content leading-tight">
                            ₦{total.toLocaleString()}
                        </p>
                        <p className="text-[11px] text-content-muted mt-0.5">Total</p>
                    </div>
                </div>
            </div>

            {/* Legend stays compact at the bottom */}
            <div className="flex flex-col gap-2.5 pt-5">
                {items.map(item => (
                    <div key={item.label} className="flex items-center gap-2.5">
                        <span className={`h-2.5 w-2.5 rounded-full shrink-0 ${item.colorClass}`} />
                        <span className="text-content text-sm flex-1 truncate">{item.label}</span>
                        <span className="font-medium text-content text-sm whitespace-nowrap">
                            ₦{item.amount.toLocaleString()}
                        </span>
                        <span className="text-content-muted text-xs whitespace-nowrap text-right w-10">
                            {item.percent}%
                        </span>
                    </div>
                ))}
            </div>
        </div>
    )
}