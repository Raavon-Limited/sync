"use client";

import {
    LineChart,
    Line,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer,
} from "recharts";

const data = [
    { date: "May 1", overall: 72, onTime: 65, completed: 42 },
    { date: "May 7", overall: 78, onTime: 70, completed: 48 },
    { date: "May 14", overall: 85, onTime: 75, completed: 55 },
    { date: "May 21", overall: 90, onTime: 82, completed: 62 },
    { date: "May 28", overall: 92, onTime: 88, completed: 68 },
    { date: "Jun 4", overall: 94, onTime: 90, completed: 74 },
];

export default function PerformanceChart() {
    return (
        <div className="bg-panel rounded-2xl border border-line/15 p-5 shadow-xs flex flex-col justify-between h-full min-w-0 w-full overflow-hidden">
            
            {/* Header Block with wrap safety */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4 w-full">
                <div className="flex items-center gap-2 flex-wrap min-w-0">
                    <h3 className="text-sm font-bold text-content whitespace-nowrap">Performance Overview</h3>
                    
                    {/* Legend */}
                    <div className="flex items-center gap-2 text-xs flex-wrap">
                        <span className="flex items-center gap-1 text-content-muted text-[10px]">
                            <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" /> Overall
                        </span>
                        <span className="flex items-center gap-1 text-content-muted text-[10px]">
                            <span className="w-2 h-2 rounded-full bg-blue-500 shrink-0" /> On-Time
                        </span>
                        <span className="flex items-center gap-1 text-content-muted text-[10px]">
                            <span className="w-2 h-2 rounded-full bg-violet-500 shrink-0" /> Completed
                        </span>
                    </div>
                </div>

                {/* Dropdown Select */}
                <select className="text-[11px] border border-line/20 rounded-lg px-2 py-1 bg-panel text-content-muted font-medium outline-none shrink-0 self-start sm:self-auto">
                    <option>Last 30 days</option>
                    <option>Last 7 days</option>
                    <option>This month</option>
                </select>
            </div>

            {/* Chart Wrapper */}
            <div className="h-64 w-full min-w-0">
                <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={data} margin={{ top: 10, right: 10, left: -25, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
                        <XAxis
                            dataKey="date"
                            axisLine={false}
                            tickLine={false}
                            tick={{ fontSize: 11, fill: "#a1a1aa" }}
                        />
                        <YAxis
                            axisLine={false}
                            tickLine={false}
                            tick={{ fontSize: 11, fill: "#a1a1aa" }}
                            domain={[0, 100]}
                        />
                        <Tooltip
                            contentStyle={{
                                backgroundColor: "#ffffff",
                                borderRadius: "12px",
                                border: "1px solid rgba(0,0,0,0.08)",
                                boxShadow: "0 4px 12px rgba(0,0,0,0.05)",
                                fontSize: "12px"
                            }}
                        />
                        <Line
                            type="monotone"
                            dataKey="overall"
                            stroke="#10b981"
                            strokeWidth={2.5}
                            dot={{ r: 3, fill: "#10b981" }}
                        />
                        <Line
                            type="monotone"
                            dataKey="onTime"
                            stroke="#3b82f6"
                            strokeWidth={2.5}
                            dot={{ r: 3, fill: "#3b82f6" }}
                        />
                        <Line
                            type="monotone"
                            dataKey="completed"
                            stroke="#8b5cf6"
                            strokeWidth={2.5}
                            dot={{ r: 3, fill: "#8b5cf6" }}
                        />
                    </LineChart>
                </ResponsiveContainer>
            </div>
        </div>
    );
}