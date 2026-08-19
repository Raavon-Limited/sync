import { Flame } from "lucide-react";

const peakTimes = [
    { time: "12:00 – 14:00", label: "Lunch rush", intensity: "Very High" },
    { time: "18:00 – 21:00", label: "Dinner rush", intensity: "High" },
    { time: "08:00 – 10:00", label: "Breakfast", intensity: "Medium" },
];

const INTENSITY_STYLE: Record<string, string> = {
    "Very High": "bg-orange-500/10 text-orange-600 dark:text-orange-400",
    "High": "bg-amber-500/10 text-amber-600 dark:text-amber-400",
    "Medium": "bg-yellow-500/10 text-yellow-600 dark:text-yellow-400",
};

export default function PeakHours() {
    return (
        <div className="bg-panel rounded-xl border border-line/15 p-5 shadow-xs h-full flex flex-col">
            <div className="flex items-center gap-2 mb-1">
                <Flame className="w-4 h-4 text-orange-500" />
                <h3 className="font-semibold text-content text-sm">Peak hours</h3>
            </div>
            <p className="text-xs text-content-muted mb-4">
                Busiest times on campus — plan your availability around these.
            </p>

            <div className="space-y-2.5 flex-1">
                {peakTimes.map((peak) => (
                    <div
                        key={peak.time}
                        className="flex items-center justify-between p-3 rounded-lg bg-surface border border-line/10"
                    >
                        <div>
                            <p className="text-sm font-medium text-content">{peak.time}</p>
                            <p className="text-xs text-content-muted">{peak.label}</p>
                        </div>
                        <span className={`text-[11px] font-semibold px-2.5 py-1 rounded-full flex-shrink-0 ${INTENSITY_STYLE[peak.intensity]}`}>
                            {peak.intensity}
                        </span>
                    </div>
                ))}
            </div>
        </div>
    );
}