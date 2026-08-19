'use client'

import { useState } from 'react'
import { ChevronRight } from 'lucide-react'
import type { EarningsEntry } from '@/lib/rider/types'

type Filter = 'all' | 'earning' | 'payout' | 'adjustment'

const TYPE_BADGE: Record<EarningsEntry['type'], string> = {
  earning: 'bg-lime/15 text-lime-deep dark:text-lime',
  bonus: 'bg-purple-500/10 text-purple-600 dark:text-purple-400',
  payout: 'bg-red-500/10 text-red-600 dark:text-red-400',
  adjustment: 'bg-yellow-500/10 text-yellow-600 dark:text-yellow-400',
}

export function EarningsHistoryTable({ entries }: { entries: EarningsEntry[] }) {
  const [filter, setFilter] = useState<Filter>('all')
  const [visibleCount, setVisibleCount] = useState(5)

  const filtered = entries.filter(e => {
    if (filter === 'all') return true
    if (filter === 'earning') return e.type === 'earning' || e.type === 'bonus'
    return e.type === filter
  })

  const visible = filtered.slice(0, visibleCount)

  return (
    <div className="rounded-xl border border-line/15 bg-panel shadow-xs px-5 py-5">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <p className="font-semibold text-content text-sm">Earnings history</p>
          <p className="text-xs text-content-muted mt-0.5">A breakdown of your earnings and payments.</p>
        </div>
        <div className="flex gap-1 p-1 rounded-lg bg-surface border border-line/10">
          {(['all', 'earning', 'payout', 'adjustment'] as Filter[]).map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-3 py-1.5 rounded-md text-xs font-semibold capitalize transition-colors ${
                filter === f ? 'bg-panel shadow-xs text-content' : 'text-content-muted hover:text-content'
              }`}
            >
              {f === 'all' ? 'All' : f === 'earning' ? 'Earnings' : f === 'payout' ? 'Payouts' : 'Adjustments'}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-4 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-content-muted border-b border-line/10">
              <th className="font-medium pb-2 pr-4">Date</th>
              <th className="font-medium pb-2 pr-4">Type</th>
              <th className="font-medium pb-2 pr-4">Order / Delivery</th>
              <th className="font-medium pb-2 pr-4">Details</th>
              <th className="font-medium pb-2 pr-4 text-right">Amount</th>
              <th className="font-medium pb-2 pr-4 text-right">Balance</th>
              <th className="pb-2" />
            </tr>
          </thead>
          <tbody className="divide-y divide-line/10">
            {visible.map(e => {
              const date = new Date(e.date)
              const isNegative = e.amount < 0
              return (
                <tr key={e.id} className="hover:bg-content-muted/5 transition-colors cursor-pointer">
                  <td className="py-3 pr-4 text-content-muted whitespace-nowrap">
                    {date.toLocaleDateString([], { day: 'numeric', month: 'short', year: 'numeric' })}, {date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </td>
                  <td className="py-3 pr-4">
                    <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${TYPE_BADGE[e.type]}`}>
                      {e.type}
                    </span>
                  </td>
                  <td className="py-3 pr-4">
                    {e.orderRef && <p className="font-semibold text-content">{e.orderRef}</p>}
                    <p className="text-content-muted text-xs">{e.title}</p>
                  </td>
                  <td className="py-3 pr-4 text-content-muted">{e.detail}</td>
                  <td className={`py-3 pr-4 text-right font-semibold whitespace-nowrap ${isNegative ? 'text-red-600 dark:text-red-400' : 'text-content'}`}>
                    {isNegative ? '-' : ''}₦{Math.abs(e.amount).toLocaleString()}
                  </td>
                  <td className="py-3 pr-4 text-right text-content-muted whitespace-nowrap">₦{e.balanceAfter.toLocaleString()}</td>
                  <td className="py-3">
                    <ChevronRight size={15} className="text-content-muted" />
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {visibleCount < filtered.length && (
        <button
          onClick={() => setVisibleCount(c => c + 5)}
          className="w-full mt-3 text-center text-xs font-semibold text-content-muted hover:text-content py-2"
        >
          View more
        </button>
      )}
    </div>
  )
}