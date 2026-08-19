const recent = [
    {
        id: "#SYNC-1048",
        customer: "Moon Hall Restaurant",
        initials: "MH",
        color: "bg-violet-100 text-violet-700 dark:bg-violet-950 dark:text-violet-300",
        time: "24 min",
        distance: "3.2 km",
        status: "On time",
        completed: "Today, 2:34 PM",
    },
    {
        id: "#SYNC-1047",
        customer: "TasteBite",
        initials: "TB",
        color: "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300",
        time: "31 min",
        distance: "4.1 km",
        status: "On time",
        completed: "Today, 1:10 PM",
    },
    {
        id: "#SYNC-1046",
        customer: "FreshCart Store",
        initials: "FC",
        color: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300",
        time: "42 min",
        distance: "5.6 km",
        status: "Late",
        completed: "Today, 11:45 AM",
    },
];

export default function RecentPerformanceTable() {
    return (
        <div className="bg-panel rounded-2xl border border-line/15 shadow-xs overflow-hidden select-none">
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-line/10">
                <h3 className="text-sm font-bold text-content">Recent Performance</h3>
                <button className="text-xs text-emerald-600 font-semibold hover:underline">
                    View all
                </button>
            </div>

            <div className="overflow-x-auto">
                <table className="w-full text-xs text-left">
                    <thead>
                        <tr className="text-content-muted uppercase text-[10px] tracking-wider border-b border-line/10">
                            <th className="px-5 py-3 font-semibold">Order ID</th>
                            <th className="px-5 py-3 font-semibold">Customer</th>
                            <th className="px-5 py-3 font-semibold">Time Taken</th>
                            <th className="px-5 py-3 font-semibold">Distance</th>
                            <th className="px-5 py-3 font-semibold">Status</th>
                            <th className="px-5 py-3 font-semibold">Completed At</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-line/10 text-content">
                        {recent.map((row) => (
                            <tr key={row.id} className="hover:bg-line/5 transition">
                                <td className="px-5 py-3.5 font-bold font-mono">{row.id}</td>
                                <td className="px-5 py-3.5">
                                    <div className="flex items-center gap-2.5">
                                        <div className={`w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold ${row.color}`}>
                                            {row.initials}
                                        </div>
                                        <span className="font-medium text-content">{row.customer}</span>
                                    </div>
                                </td>
                                <td className="px-5 py-3.5 text-content-muted">{row.time}</td>
                                <td className="px-5 py-3.5 text-content-muted">{row.distance}</td>
                                <td className="px-5 py-3.5">
                                    {row.status === "On time" ? (
                                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-50 text-emerald-600 border border-emerald-200/50">
                                            On time ✓
                                        </span>
                                    ) : (
                                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-red-50 text-coral border border-red-200/50">
                                            Late △
                                        </span>
                                    )}
                                </td>
                                <td className="px-5 py-3.5 text-content-muted">{row.completed}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}