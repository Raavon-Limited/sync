'use client'

import type { EarningsDailyPoint } from '@/lib/rider/types'

export function EarningsOverviewChart({ data }: { data: EarningsDailyPoint[] }) {
    const width = 600
    const height = 180
    const max = Math.max(...data.map(d => d.amount), 1)
    const stepX = width / (data.length - 1)

    const points = data.map((d, i) => ({
        x: i * stepX,
        y: height - (d.amount / max) * (height - 10) - 5,
    }))

    const linePath = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ')
    const areaPath = `${linePath} L ${width} ${height} L 0 ${height} Z`

    return (
        <div className="w-full h-full overflow-x-auto">
            <svg
                viewBox={`0 0 ${width} ${height + 24}`}
                width="100%"
                height="100%"
                className="min-w-[420px]"
                preserveAspectRatio="none"
            >
                <defs>
                    <linearGradient id="earningsFill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="currentColor" stopOpacity="0.25" className="text-lime" />
                        <stop offset="100%" stopColor="currentColor" stopOpacity="0" className="text-lime" />
                    </linearGradient>
                </defs>

                <path d={areaPath} fill="url(#earningsFill)" />
                <path d={linePath} fill="none" stroke="currentColor" strokeWidth={2} className="text-lime-deep dark:text-lime" />

                {points.map((p, i) => (
                    <circle key={i} cx={p.x} cy={p.y} r={3} fill="currentColor" className="text-lime-deep dark:text-lime" />
                ))}

                {data.map((d, i) => (
                    <text
                        key={d.label}
                        x={points[i].x}
                        y={height + 16}
                        textAnchor="middle"
                        className="fill-current text-content-muted"
                        fontSize={10}
                    >
                        {d.label}
                    </text>
                ))}
            </svg>
        </div>
    )
}