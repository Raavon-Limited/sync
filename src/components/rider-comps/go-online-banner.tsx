import { Bike } from 'lucide-react'

export function GoOnlineBanner() {
    return (
        <div className="rounded-xl bg-lime/10 border border-lime/20 px-5 py-4 flex items-center gap-4 flex-wrap sm:flex-nowrap">
            <div className="w-11 h-11 rounded-full bg-lime/20 flex items-center justify-center flex-shrink-0">
                <Bike size={20} className="text-lime-deep dark:text-lime" />
            </div>
            <div className="flex-1 min-w-0">
                <p className="font-semibold text-content text-sm">More deliveries, more earnings!</p>
                <p className="text-xs text-content-muted mt-0.5">Stay active during peak hours to earn more bonuses.</p>
            </div>
            <button
                type="button"
                className="flex-shrink-0 rounded-lg bg-lime text-ink px-4 py-2 text-sm font-semibold hover:brightness-95 transition-all"
            >
                Go Online
            </button>
        </div>
    )
}