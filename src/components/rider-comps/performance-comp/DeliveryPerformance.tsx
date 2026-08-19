import { Package, CheckCircle2, XCircle, Clock, AlertTriangle } from "lucide-react";

export default function DeliveryPerformance() {
    return (
        <div className="bg-panel rounded-2xl border border-line/15 p-5 shadow-xs">
            <h3 className="text-sm font-bold text-content mb-4">Delivery Performance Metrics</h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-5">
                {/* Left Metric Column */}
                <div className="space-y-4">
                    <StatRow
                        icon={<Package size={16} className="text-ink" />}
                        label="Total Deliveries"
                        value="248"
                        iconBg="bg-blue-400"
                    />
                    <StatRow
                        icon={<XCircle size={16} className="text-ink" />}
                        label="Cancelled Deliveries"
                        value="5"
                        iconBg="bg-coral"
                    />
                    <StatRow
                        icon={<Clock size={16} className="text-ink" />}
                        label="Average Delivery Time"
                        value="28 min"
                        iconBg="bg-amber-400"
                    />
                </div>

                {/* Right Metric Column (Progress) */}
                <div className="space-y-4">
                    <ProgressRow
                        icon={<CheckCircle2 size={14} />}
                        label="Completed Deliveries"
                        value="243"
                        percentage={98}
                        color="bg-emerald-500"
                    />
                    <ProgressRow
                        icon={<Clock size={14} />}
                        label="On-Time Deliveries"
                        value="238"
                        percentage={96}
                        color="bg-emerald-500"
                    />
                    <ProgressRow
                        icon={<AlertTriangle size={14} />}
                        label="Late Deliveries"
                        value="10"
                        percentage={4}
                        color="bg-red-400"
                        isNegative
                    />
                </div>
            </div>
        </div>
    );
}

function StatRow({
    icon,
    label,
    value,
    iconBg,
}: {
    icon: React.ReactNode;
    label: string;
    value: string;
    iconBg: string;
}) {
    return (
        <div className="flex items-center gap-3">
            <div className={`w-8 h-8 rounded-lg ${iconBg} flex items-center justify-center shrink-0 shadow-xs`}>
                {icon}
            </div>
            <div>
                <p className="text-[11px] font-semibold uppercase tracking-wider text-content-muted">{label}</p>
                <p className="text-lg font-bold text-content font-display">{value}</p>
            </div>
        </div>
    );
}

function ProgressRow({
    icon,
    label,
    value,
    percentage,
    color,
    isNegative = false,
}: {
    icon: React.ReactNode;
    label: string;
    value: string;
    percentage: number;
    color: string;
    isNegative?: boolean;
}) {
    return (
        <div>
            <div className="flex items-center justify-between mb-1.5">
                <div className="flex items-center gap-2">
                    <div className={`p-1 rounded-md ${isNegative ? "bg-red-50 text-red-500" : "bg-emerald-50 text-emerald-600"}`}>
                        {icon}
                    </div>
                    <span className="text-xs font-medium text-content">{label}</span>
                </div>
                <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-content">{value}</span>
                    <span className={`text-xs font-semibold ${isNegative ? "text-red-500" : "text-emerald-600"}`}>
                        {percentage}%
                    </span>
                </div>
            </div>
            <div className="w-full bg-line/15 rounded-full h-2">
                <div
                    className={`${color} h-2 rounded-full`}
                    style={{ width: `${percentage}%` }}
                />
            </div>
        </div>
    );
}