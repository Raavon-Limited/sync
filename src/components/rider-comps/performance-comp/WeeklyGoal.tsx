import { Target, Package, Clock, Banknote } from "lucide-react";

export default function WeeklyGoal() {
    const progress = 72;

    return (
        <div className="bg-panel rounded-2xl border border-line/15 p-5 shadow-xs flex flex-col justify-between h-full select-none">
            <div>
                {/* Section Header */}
                <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-lg bg-lime flex items-center justify-center">
                            <Target size={16} className="text-ink" />
                        </div>
                        <h3 className="text-sm font-bold text-content">Weekly Goal</h3>
                    </div>
                    <span className="text-[11px] font-semibold text-content-muted uppercase tracking-wider bg-line/10 px-2 py-0.5 rounded-full">
                        Target
                    </span>
                </div>

                {/* Main Progress Indicator */}
                <div className="mb-4">
                    <div className="flex items-baseline justify-between mb-1">
                        <span className="font-display text-2xl font-bold text-content">
                            72 <span className="text-sm font-normal text-content-muted">/ 100 deliveries</span>
                        </span>
                        <span className="text-lg font-bold text-emerald-600 font-mono">{progress}%</span>
                    </div>

                    <div className="w-full bg-line/15 rounded-full h-2 overflow-hidden">
                        <div
                            className="bg-emerald-500 h-full rounded-full transition-all duration-500"
                            style={{ width: `${progress}%` }}
                        />
                    </div>
                </div>

                {/* Sub-Metric Columns */}
                <div className="grid grid-cols-3 gap-2 py-3 px-2 bg-line/5 rounded-xl border border-line/10 mb-4 text-center">
                    <div className="min-w-0">
                        <Package size={14} className="mx-auto text-content-muted mb-1" />
                        <p className="text-sm font-bold text-content">28</p>
                        <p className="text-[10px] text-content-muted truncate">Remaining</p>
                    </div>

                    <div className="min-w-0 border-x border-line/10">
                        <Clock size={14} className="mx-auto text-content-muted mb-1" />
                        <p className="text-sm font-bold text-content">3 days</p>
                        <p className="text-[10px] text-content-muted truncate">Time left</p>
                    </div>

                    <div className="min-w-0">
                        <Banknote size={14} className="mx-auto text-content-muted mb-1" />
                        <p className="text-sm font-bold text-content">₦32.4k</p>
                        <p className="text-[10px] text-content-muted truncate">Est. earn</p>
                    </div>
                </div>
            </div>

            {/* Action Button */}
            <button className="w-full py-2.5 bg-line/10 hover:bg-line/20 text-content text-xs font-semibold rounded-xl transition duration-150">
                View Detailed Goals
            </button>
        </div>
    );
}