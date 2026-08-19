import { AlertCircle, Clock, AlertTriangle } from "lucide-react";

const items = [
    { label: "Average delivery time", value: "28 min", icon: Clock },
    { label: "Late deliveries", value: "10", icon: AlertTriangle, isWarning: true },
];

export default function AreasToImprove() {
    return (
        <div className="bg-panel rounded-2xl border border-line/15 p-5 shadow-xs flex flex-col justify-between">
            <div>
                <div className="flex items-center gap-2 mb-3">
                    <AlertCircle size={18} className="text-amber-500" />
                    <h3 className="text-sm font-bold text-content">Areas to improve</h3>
                </div>
                <div className="space-y-2.5">
                    {items.map((item) => (
                        <div key={item.label} className="flex items-center justify-between p-2 rounded-xl hover:bg-line/5 transition">
                            <div className="flex items-center gap-2.5">
                                <item.icon size={15} className={item.isWarning ? "text-coral" : "text-content-muted"} />
                                <span className="text-xs font-medium text-content">{item.label}</span>
                            </div>
                            <span className={`text-xs font-bold ${item.isWarning ? "text-coral" : "text-content"}`}>
                                {item.value}
                            </span>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}