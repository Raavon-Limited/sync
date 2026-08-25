'use client'

import {
    AreaChart,
    Area,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer,
} from 'recharts'
import type { EarningsDailyPoint } from '@/lib/rider/types'

export function EarningsOverviewChart({ data }: { data: EarningsDailyPoint[] }) {
    return (
        <div className="bg-panel rounded-2xl border border-line/15 p-5 shadow-xs flex flex-col h-full min-w-0 w-full overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between gap-2 mb-4">
                <h3 className="text-sm font-bold text-content">Earnings overview</h3>

                <select className="text-[11px] border border-line/20 rounded-lg px-2.5 py-1 bg-panel text-content-muted font-medium outline-none">
                    <option>Daily</option>
                    <option>Weekly</option>
                    <option>Monthly</option>
                </select>
            </div>

            {/* Chart */}
            <div className="h-48 w-full min-w-0">
                <ResponsiveContainer width="100%" height="100%">
                    <AreaChart
                        data={data}
                        margin={{ top: 8, right: 8, left: -20, bottom: 0 }}
                    >
                        <defs>
                            <linearGradient id="earningsGradient" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="0%" stopColor="#84cc16" stopOpacity={0.35} />
                                <stop offset="100%" stopColor="#84cc16" stopOpacity={0} />
                            </linearGradient>
                        </defs>

                        <CartesianGrid
                            strokeDasharray="3 3"
                            vertical={false}
                            stroke="#f0f0f0"
                        />

                        <XAxis
                            dataKey="label"
                            axisLine={false}
                            tickLine={false}
                            tick={{ fontSize: 11, fill: '#a1a1aa' }}
                            dy={6}
                        />

                        <YAxis
                            axisLine={false}
                            tickLine={false}
                            tick={{ fontSize: 11, fill: '#a1a1aa' }}
                            tickFormatter={(value) => `₦${value >= 1000 ? `${(value / 1000).toFixed(0)}k` : value}`}
                        />

                        <Tooltip
                            contentStyle={{
                                backgroundColor: '#ffffff',
                                borderRadius: '12px',
                                border: '1px solid rgba(0,0,0,0.08)',
                                boxShadow: '0 4px 12px rgba(0,0,0,0.06)',
                                fontSize: '12px',
                                padding: '10px 14px',
                            }}
                            formatter={(value: any) => [
                                `₦${(Number(value) || 0).toLocaleString()}`,
                                'Earnings',
                            ]}
                            labelStyle={{ color: '#71717a', marginBottom: 4 }}
                        />

                        <Area
                            type="monotone"
                            dataKey="amount"
                            stroke="#65a30d"
                            strokeWidth={2.5}
                            fill="url(#earningsGradient)"
                            activeDot={{
                                r: 5,
                                strokeWidth: 0,
                                fill: '#65a30d',
                            }}
                            dot={{
                                r: 3.5,
                                fill: '#65a30d',
                                strokeWidth: 0,
                            }}
                        />
                    </AreaChart>
                </ResponsiveContainer>
            </div>
        </div>
    )
}