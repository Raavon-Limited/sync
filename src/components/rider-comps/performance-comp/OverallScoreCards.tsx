import { TrendingUp, Clock, ClipboardCheck, Star } from "lucide-react";

const metrics = [
    {
        title: "Overall Performance",
        value: "94%",
        label: "Excellent",
        change: "+6%",
        icon: TrendingUp,
        bg: "bg-lime",
    },
    {
        title: "On-Time Rate",
        value: "96%",
        label: "Excellent",
        change: "+4%",
        icon: Clock,
        bg: "bg-blue-400",
    },
    {
        title: "Completion Rate",
        value: "98%",
        label: "Excellent",
        change: "+3%",
        icon: ClipboardCheck,
        bg: "bg-lime",
    },
    {
        title: "Customer Rating",
        value: "4.9",
        label: "Excellent",
        change: "+0.2",
        icon: Star,
        bg: "bg-amber-400",
        isRating: true,
    },
];

export default function OverallScoreCards() {
    return (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5 mb-2">
            {metrics.map((m) => {
                const Icon = m.icon;
                return (
                    <div
                        key={m.title}
                        className="bg-panel rounded-2xl border border-line/15 p-4 flex flex-col justify-between shadow-xs select-none"
                    >
                        <div className="flex items-start justify-between gap-2">
                            <div>
                                <p className="text-[11px] font-semibold uppercase tracking-widest text-content-muted mb-1">
                                    {m.title}
                                </p>
                                <div className="flex items-baseline gap-1.5">
                                    <span className="font-display text-2xl font-bold text-content">
                                        {m.value}
                                    </span>
                                    {m.isRating && (
                                        <Star size={16} className="fill-amber-400 text-amber-400" />
                                    )}
                                </div>
                            </div>

                            <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 shadow-xs ${m.bg}`}>
                                <Icon size={16} className="text-ink" />
                            </div>
                        </div>

                        <div className="flex items-center justify-between mt-3 pt-3 border-t border-line/10">
                            <span className="text-[11px] font-medium text-emerald-600 bg-emerald-50 dark:bg-emerald-950/40 px-2 py-0.5 rounded-md">
                                {m.label}
                            </span>
                            <span className="text-[11px] font-semibold text-content-muted">
                                {m.change} <span className="font-normal text-[10px]">vs last wk</span>
                            </span>
                        </div>
                    </div>
                );
            })}
        </div>
    );
}