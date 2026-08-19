interface WeekPoint { day: string; amount: number }

export function EarningsSummaryCard({ weekData, total, changePercent }: { weekData: WeekPoint[]; total: number; changePercent: number }) {
    const max = Math.max(...weekData.map(d => d.amount), 1)

    return (
        <div className="rounded-xl border border-line/15 bg-panel shadow-xs px-5 py-5">
            <div className="flex items-center justify-between">
                <p className="font-semibold text-content text-sm">Earnings summary</p>
                <a href="/rider/earnings" className="text-xs font-medium text-content-muted hover:text-content">View all</a>
            </div>

            <p className="text-2xl font-black text-content mt-2">₦{total.toLocaleString()}</p>
            <p className="text-xs text-green-600 dark:text-green-400 font-medium mt-0.5">+{changePercent}% vs last week</p>

            {/* Each column now has an explicit h-16, so the bar's percentage height
          actually has something to resolve against — that's the real fix. */}
            <div className="mt-4 flex items-stretch justify-between gap-1.5">
                {weekData.map(d => (
                    <div key={d.day} className="flex-1 min-w-0 h-16 flex flex-col justify-end items-center gap-1.5">
                        <div
                            className="w-full rounded bg-lime"
                            style={{ height: `${Math.max((d.amount / max) * 100, 8)}%` }}
                        />
                        <p className="text-[10px] text-content-muted">{d.day}</p>
                    </div>
                ))}
            </div>
        </div>
    )
}

export function WeeklyGoalCard({ current, target, endsInDays }: { current: number; target: number; endsInDays: number }) {
    const pct = Math.min(Math.round((current / target) * 100), 100)

    return (
        <div className="rounded-xl border border-line/15 bg-panel shadow-xs px-5 py-5">
            <div className="flex items-center justify-between">
                <p className="font-semibold text-content text-sm">Goals</p>
                <a href="/rider/performance" className="text-xs font-medium text-content-muted hover:text-content">View all</a>
            </div>

            <p className="text-xs text-content-muted mt-3">Weekly goal</p>
            <p className="text-lg font-black text-lime-deep dark:text-lime mt-1">
                {pct}% <span className="text-xs font-normal text-content-muted">₦{current.toLocaleString()} / ₦{target.toLocaleString()}</span>
            </p>
            <div className="mt-2 h-1.5 rounded-full bg-content-muted/10 overflow-hidden">
                <div className="h-full bg-lime" style={{ width: `${pct}%` }} />
            </div>
            <p className="text-[11px] text-content-muted mt-1.5">Ends in {endsInDays} days</p>
        </div>
    )
}