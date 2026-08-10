'use client';

import { useState, useRef, useEffect } from 'react';
import { CalendarDays, Download, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { Invoice } from './types';

interface DateRange {
  from: string;
  to: string;
}

interface Props {
  data: Invoice[];
  search: string;
  onSearchChange: (v: string) => void;
  dateRange: DateRange;
  onDateRangeChange: (range: DateRange) => void;
  onExportAll: () => void;
  onExportFiltered: () => void;
}

export function BillingHistoryToolbar({
  search,
  onSearchChange,
  dateRange,
  onDateRangeChange,
  onExportAll,
  onExportFiltered,
}: Props) {
  const [popoverOpen, setPopoverOpen] = useState(false);
  const [localRange, setLocalRange] = useState<DateRange>(dateRange);
  const popoverRef = useRef<HTMLDivElement>(null);

  const hasDateFilter = Boolean(dateRange.from || dateRange.to);

  // Close popover on outside click
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setPopoverOpen(false);
      }
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  function applyDateRange() {
    onDateRangeChange(localRange);
    setPopoverOpen(false);
  }

  function clearDateRange() {
    const empty = { from: '', to: '' };
    setLocalRange(empty);
    onDateRangeChange(empty);
    setPopoverOpen(false);
  }

  return (
    <div className="bg-panel shadow-card flex flex-col gap-4 rounded-xl p-4 lg:flex-row lg:items-center lg:justify-between">
      {/* Left Side */}
      <div className="flex w-full flex-col gap-3 lg:w-auto">
        {/* Search */}
        <Input
          placeholder="Search invoices…"
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          className="!border-line/20 w-full lg:w-64"
        />

        {/* Mobile: Date Range + Export All */}
        <div className="grid w-full grid-cols-2 gap-2 lg:hidden">
          {/* Date Range */}
          <div className="relative" ref={popoverRef}>
            <Button
              variant="outline"
              size="sm"
              className={`w-full justify-center gap-2 ${
                hasDateFilter ? 'border-violet-400 bg-violet-50 text-violet-700' : ''
              }`}
              onClick={() => {
                setLocalRange(dateRange);
                setPopoverOpen((p) => !p);
              }}
            >
              <CalendarDays className="h-4 w-4" />
              {hasDateFilter ? 'Date Range' : 'Date Range'}

              {hasDateFilter && (
                <X
                  className="ml-1 h-3 w-3 opacity-60 hover:opacity-100"
                  onClick={(e) => {
                    e.stopPropagation();
                    clearDateRange();
                  }}
                />
              )}
            </Button>

            {popoverOpen && (
              <div className="border-line/10 bg-panel shadow-pop absolute top-full left-0 z-30 mt-2 w-72 rounded-xl border p-4">
                <p className="text-content-muted mb-3 font-mono text-[10px] tracking-widest uppercase">
                  Filter by date
                </p>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-content-muted mb-1 block text-xs">From</label>
                    <Input
                      type="date"
                      value={localRange.from}
                      onChange={(e) =>
                        setLocalRange((r) => ({
                          ...r,
                          from: e.target.value,
                        }))
                      }
                    />
                  </div>

                  <div>
                    <label className="text-content-muted mb-1 block text-xs">To</label>
                    <Input
                      type="date"
                      value={localRange.to}
                      onChange={(e) =>
                        setLocalRange((r) => ({
                          ...r,
                          to: e.target.value,
                        }))
                      }
                    />
                  </div>
                </div>

                <div className="mt-3 flex justify-end gap-2">
                  <Button variant="ghost" size="sm" onClick={clearDateRange}>
                    Clear
                  </Button>

                  <Button
                    size="sm"
                    className="bg-violet-600 text-white hover:bg-violet-700"
                    onClick={applyDateRange}
                  >
                    Apply
                  </Button>
                </div>
              </div>
            )}
          </div>

          {/* Export All */}
          <Button
            variant="outline"
            size="sm"
            onClick={onExportAll}
            className="w-full justify-center gap-2"
          >
            <Download className="h-4 w-4" />
            Export All
          </Button>
        </div>
      </div>

      {/* Desktop Buttons */}
      <div className="hidden items-center gap-2 lg:flex">
        {/* Desktop Date Range */}
        <div className="relative" ref={popoverRef}>
          <Button
            variant="outline"
            size="sm"
            className={`gap-2 ${
              hasDateFilter ? 'border-violet-400 bg-violet-50 text-violet-700' : ''
            }`}
            onClick={() => {
              setLocalRange(dateRange);
              setPopoverOpen((p) => !p);
            }}
          >
            <CalendarDays className="h-4 w-4" />
            {hasDateFilter ? `${dateRange.from || '…'} → ${dateRange.to || '…'}` : 'Date Range'}

            {hasDateFilter && (
              <X
                className="ml-1 h-3 w-3 opacity-60 hover:opacity-100"
                onClick={(e) => {
                  e.stopPropagation();
                  clearDateRange();
                }}
              />
            )}
          </Button>

          {popoverOpen && (
            <div className="border-line/10 bg-panel shadow-pop absolute top-full right-0 z-30 mt-2 w-72 rounded-xl border p-4">
              <p className="text-content-muted mb-3 font-mono text-[10px] tracking-widest uppercase">
                Filter by date
              </p>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-content-muted mb-1 block text-xs">From</label>
                  <Input
                    type="date"
                    value={localRange.from}
                    onChange={(e) =>
                      setLocalRange((r) => ({
                        ...r,
                        from: e.target.value,
                      }))
                    }
                  />
                </div>

                <div>
                  <label className="text-content-muted mb-1 block text-xs">To</label>
                  <Input
                    type="date"
                    value={localRange.to}
                    onChange={(e) =>
                      setLocalRange((r) => ({
                        ...r,
                        to: e.target.value,
                      }))
                    }
                  />
                </div>
              </div>

              <div className="mt-3 flex justify-end gap-2">
                <Button variant="ghost" size="sm" onClick={clearDateRange}>
                  Clear
                </Button>

                <Button
                  size="sm"
                  className="bg-violet-600 text-white hover:bg-violet-700"
                  onClick={applyDateRange}
                >
                  Apply
                </Button>
              </div>
            </div>
          )}
        </div>

        {hasDateFilter && (
          <Button variant="outline" size="sm" onClick={onExportFiltered} className="gap-2">
            <Download className="h-4 w-4" />
            Export Filtered
          </Button>
        )}

        <Button variant="outline" size="sm" onClick={onExportAll} className="gap-2">
          <Download className="h-4 w-4" />
          Export All
        </Button>
      </div>
    </div>
  );
}
