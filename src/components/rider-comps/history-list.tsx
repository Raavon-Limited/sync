// components/rider-comps/history-list.tsx
'use client'

import { useMemo, useState } from 'react'
import { Search, Star, ChevronRight, Calendar, Filter } from 'lucide-react'
import type { RiderOrder } from '@/lib/rider/types'
import { HistoryDetailSheet } from './history-detail-sheet'
import { cn } from '@/lib/utils'

type DateFilter = 'today' | 'week' | 'month' | 'all'
type StatusFilter = 'all' | 'delivered' | 'cancelled' | 'failed'

const STATUS_CONFIG: Record<
  string,
  { label: string; dot: string; text: string; bg: string }
> = {
  delivered: {
    label: 'Completed',
    dot: 'bg-green-500',
    text: 'text-green-700 dark:text-green-400',
    bg: 'bg-green-50 dark:bg-green-900/20',
  },
  cancelled: {
    label: 'Cancelled',
    dot: 'bg-neutral-400',
    text: 'text-neutral-600 dark:text-neutral-400',
    bg: 'bg-neutral-50 dark:bg-neutral-800/40',
  },
  failed: {
    label: 'Failed',
    dot: 'bg-red-500',
    text: 'text-red-700 dark:text-red-400',
    bg: 'bg-red-50 dark:bg-red-900/20',
  },
}

function isWithinRange(dateStr: string, filter: DateFilter): boolean {
  if (filter === 'all') return true
  const date = new Date(dateStr)
  const now = new Date()
  const days = (now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24)

  if (filter === 'today') return days < 1
  if (filter === 'week') return days < 7
  if (filter === 'month') return days < 30
  return true
}

export function HistoryList({ orders }: { orders: RiderOrder[] }) {
  const [query, setQuery] = useState('')
  const [dateFilter, setDateFilter] = useState<DateFilter>('all')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [selected, setSelected] = useState<RiderOrder | null>(null)

  const filtered = useMemo(() => {
    return orders.filter((order) => {
      if (statusFilter !== 'all' && order.status !== statusFilter) return false
      if (!isWithinRange(order.createdAt, dateFilter)) return false

      if (query.trim()) {
        const q = query.trim().toLowerCase()
        const matchesId = order.id.toLowerCase().includes(q)
        const matchesName = order.customerName?.toLowerCase().includes(q)
        const matchesVendor = order.vendorName?.toLowerCase().includes(q)
        if (!matchesId && !matchesName && !matchesVendor) return false
      }

      return true
    })
  }, [orders, query, dateFilter, statusFilter])

  return (
    <div className="flex flex-col gap-5">
      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        {/* Search */}
        <div className="relative flex-1">
          <Search
            size={16}
            className="absolute left-3.5 top-1/2 -translate-y-1/2 text-content-muted"
          />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by Order ID, customer or vendor..."
            className="w-full rounded-xl border border-line/15 bg-panel pl-10 pr-4 py-2.5 text-sm outline-none focus:border-lime/60 transition-colors shadow-xs"
          />
        </div>

        {/* Date filter */}
        <div className="relative">
          <Calendar
            size={15}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-content-muted pointer-events-none"
          />
          <select
            value={dateFilter}
            onChange={(e) => setDateFilter(e.target.value as DateFilter)}
            className="appearance-none rounded-xl border border-line/15 bg-panel pl-9 pr-8 py-2.5 text-sm font-medium text-content outline-none shadow-xs cursor-pointer"
          >
            <option value="all">All time</option>
            <option value="today">Today</option>
            <option value="week">This week</option>
            <option value="month">This month</option>
          </select>
        </div>

        {/* Status filter */}
        <div className="relative">
          <Filter
            size={15}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-content-muted pointer-events-none"
          />
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
            className="appearance-none rounded-xl border border-line/15 bg-panel pl-9 pr-8 py-2.5 text-sm font-medium text-content outline-none shadow-xs cursor-pointer"
          >
            <option value="all">All statuses</option>
            <option value="delivered">Completed</option>
            <option value="cancelled">Cancelled</option>
            <option value="failed">Failed</option>
          </select>
        </div>
      </div>

      {/* Results count */}
      <p className="text-xs text-content-muted">
        {filtered.length} {filtered.length === 1 ? 'delivery' : 'deliveries'} found
      </p>

      {/* List */}
      {filtered.length === 0 ? (
        <div className="rounded-xl border border-dashed border-line/20 px-5 py-16 text-center">
          <p className="text-content-muted text-sm">No orders match your filters.</p>
          <button
            onClick={() => {
              setQuery('')
              setDateFilter('all')
              setStatusFilter('all')
            }}
            className="mt-3 text-sm font-medium text-lime-deep dark:text-lime hover:underline"
          >
            Clear filters
          </button>
        </div>
      ) : (
        <div className="flex flex-col gap-2.5">
          {filtered.map((order) => {
            const status = STATUS_CONFIG[order.status] ?? STATUS_CONFIG.delivered
            const date = new Date(order.createdAt)

            return (
              <button
                key={order.id}
                onClick={() => setSelected(order)}
                className="group text-left rounded-xl border border-line/15 bg-panel shadow-xs p-4 flex items-center justify-between gap-4 hover:border-line/30 hover:shadow-sm transition-all"
              >
                <div className="flex flex-col gap-1.5 min-w-0">
                  {/* Status + ID */}
                  <div className="flex items-center gap-2">
                    <span
                      className={cn(
                        'inline-flex items-center gap-1.5 text-[11px] font-semibold px-2 py-0.5 rounded-full',
                        status.bg,
                        status.text
                      )}
                    >
                      <span className={cn('h-1.5 w-1.5 rounded-full', status.dot)} />
                      {status.label}
                    </span>
                    <span className="text-[11px] text-content-muted font-mono">
                      #{order.id.slice(0, 12)}
                    </span>
                  </div>

                  {/* Vendor → Location */}
                  <p className="font-semibold text-content text-sm truncate">
                    {order.vendorName}
                    <span className="text-content-muted font-normal mx-1.5">→</span>
                    <span className="font-normal text-content-muted">
                      {order.deliveryAddress}
                    </span>
                  </p>

                  {/* Date & time */}
                  <p className="text-xs text-content-muted">
                    {date.toLocaleDateString('en-NG', {
                      day: 'numeric',
                      month: 'short',
                      year: 'numeric',
                    })}
                    {' · '}
                    {date.toLocaleTimeString([], {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </p>
                </div>

                {/* Amount + rating + chevron */}
                <div className="flex items-center gap-3 shrink-0">
                  <div className="text-right">
                    <p className="font-semibold text-content text-sm">
                      ₦{order.total.toLocaleString()}
                    </p>
                    {order.customerRating != null && (
                      <p className="inline-flex items-center gap-1 text-xs text-content-muted mt-0.5">
                        <Star size={11} className="fill-yellow-400 text-yellow-400" />
                        {order.customerRating.toFixed(1)}
                      </p>
                    )}
                  </div>
                  <ChevronRight
                    size={16}
                    className="text-content-muted group-hover:text-content transition-colors"
                  />
                </div>
              </button>
            )
          })}
        </div>
      )}

      <HistoryDetailSheet order={selected} onClose={() => setSelected(null)} />
    </div>
  )
}