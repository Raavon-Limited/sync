'use client'

import { useState } from 'react'
import type { RiderOrder } from '@/lib/rider/types'
import { ActiveOrdersList } from './active-orders-list'
import { AvailableOrderList } from './available-order-list'
import { Calendar } from 'lucide-react'

type Tab = 'active' | 'available' | 'scheduled'

export function OrderTabs({
    active,
    available,
}: {
    active: RiderOrder[]
    available: RiderOrder[]
}) {
    const [tab, setTab] = useState<Tab>('active')

    const tabs: { key: Tab; label: string; count: number | null }[] = [
        { key: 'active', label: 'Active Orders', count: active.length },
        { key: 'available', label: 'Available Jobs', count: available.length },
        { key: 'scheduled', label: 'Scheduled', count: null },
    ]

    return (
        <div className="flex flex-col gap-5">
            <div className="flex items-center gap-1.5 p-1 rounded-xl bg-panel border border-line/15 shadow-xs">
                {tabs.map((t) => {
                    const isActive = tab === t.key
                    return (
                        <button
                            key={t.key}
                            onClick={() => setTab(t.key)}
                            className={`
                                relative flex-1 flex items-center justify-center gap-2
                                px-4 py-2.5 rounded-lg text-sm font-semibold transition-colors
                                ${isActive
                                    ? 'bg-lime text-ink'
                                    : 'text-content-muted hover:text-content hover:bg-content-muted/5'
                                }
                            `}
                        >
                            {t.label}
                            {typeof t.count === 'number' && (
                                <span className={`
                                    inline-flex items-center justify-center
                                    h-5 min-w-5 px-1.5 rounded-full text-[10px] font-bold
                                    ${isActive
                                        ? 'bg-ink text-lime'
                                        : t.count > 0
                                            ? 'bg-content-muted/15 text-content-muted'
                                            : 'bg-content-muted/10 text-content-muted/50'
                                    }
                                `}>
                                    {t.count}
                                </span>
                            )}
                        </button>
                    )
                })}
            </div>

            {tab === 'active' && <ActiveOrdersList orders={active} />}
            {tab === 'available' && <AvailableOrderList orders={available} />}
            {tab === 'scheduled' && (
                <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-line/20 px-5 py-16 text-center">
                    <div className="w-11 h-11 rounded-full bg-lime/10 flex items-center justify-center">
                        <Calendar size={20} className="text-lime-deep dark:text-lime" />
                    </div>
                    <div>
                        <p className="font-semibold text-content text-sm">No scheduled jobs</p>
                        <p className="text-content-muted text-xs mt-0.5 max-w-xs">
                            Scheduling isn't set up yet — future job times will appear here.
                        </p>
                    </div>
                </div>
            )}
        </div>
    )
}