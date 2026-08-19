import { Star, ThumbsUp, MessageSquare, TrendingUp } from "lucide-react";

const distribution = [
    { stars: 5, count: 98, percentage: 79 },
    { stars: 4, count: 18, percentage: 15 },
    { stars: 3, count: 5, percentage: 4 },
    { stars: 2, count: 2, percentage: 1.5 },
    { stars: 1, count: 1, percentage: 0.5 },
];

export default function RatingSummary() {
    return (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
            <div className="lg:col-span-5 bg-panel rounded-xl border border-line/15 p-6 shadow-xs">
                <div className="flex items-start gap-8">
                    <div>
                        <p className="text-sm text-content-muted mb-1">Average Rating</p>
                        <div className="flex items-center gap-2">
                            <span className="text-4xl font-bold text-content">4.8</span>
                            <Star className="w-7 h-7 fill-amber-400 text-amber-400" />
                        </div>
                        <p className="text-sm text-content-muted mt-2">
                            Total Reviews <span className="font-semibold text-content">124</span>
                        </p>
                    </div>

                    <div className="flex-1 space-y-2">
                        {distribution.map((item) => (
                            <div key={item.stars} className="flex items-center gap-2">
                                <span className="text-xs text-content-muted w-3">{item.stars}</span>
                                <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
                                <div className="flex-1 h-2 bg-content-muted/10 rounded-full overflow-hidden">
                                    <div
                                        className="h-full bg-lime-deep dark:bg-lime rounded-full"
                                        style={{ width: `${item.percentage}%` }}
                                    />
                                </div>
                                <span className="text-xs text-content-muted w-6 text-right">
                                    {item.count}
                                </span>
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            <div className="lg:col-span-7 grid grid-cols-2 gap-4">
                <StatCard
                    icon={<ThumbsUp className="w-5 h-5" />}
                    iconBg="bg-lime/10 text-lime-deep dark:text-lime"
                    label="5-Star Reviews"
                    value="98"
                />
                <StatCard
                    icon={<MessageSquare className="w-5 h-5" />}
                    iconBg="bg-amber-500/10 text-amber-600 dark:text-amber-400"
                    label="Response Rate"
                    value="92%"
                />
                <StatCard
                    icon={<Star className="w-5 h-5" />}
                    iconBg="bg-purple-500/10 text-purple-600 dark:text-purple-400"
                    label="Total Reviews"
                    value="124"
                />
                <StatCard
                    icon={<TrendingUp className="w-5 h-5" />}
                    iconBg="bg-blue-500/10 text-blue-600 dark:text-blue-400"
                    label="Rating Trend"
                    value="+8%"
                    sub="vs last 30 days"
                />
            </div>
        </div>
    );
}

function StatCard({
    icon,
    iconBg,
    label,
    value,
    sub,
}: {
    icon: React.ReactNode;
    iconBg: string;
    label: string;
    value: string;
    sub?: string;
}) {
    return (
        <div className="bg-panel rounded-xl border border-line/15 p-5 shadow-xs flex items-start gap-4">
            <div className={`p-2.5 rounded-lg ${iconBg}`}>{icon}</div>
            <div>
                <p className="text-sm text-content-muted">{label}</p>
                <p className="text-2xl font-bold text-content mt-0.5">{value}</p>
                {sub && <p className="text-xs text-content-muted/70 mt-0.5">{sub}</p>}
            </div>
        </div>
    );
}