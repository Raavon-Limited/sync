'use client'

import { useEffect, useRef, useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'

interface Option { value: string; label: string }

interface Props {
    icon: React.ReactNode
    value: string
    options: Option[]
    onChange: (value: string) => void
}

export function HistoryFilterDropdown({ icon, value, options, onChange }: Props) {
    const [open, setOpen] = useState(false)
    const ref = useRef<HTMLDivElement>(null)
    const selected = options.find(o => o.value === value)

    useEffect(() => {
        function handleClickOutside(e: MouseEvent) {
            if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
        }
        document.addEventListener('mousedown', handleClickOutside)
        return () => document.removeEventListener('mousedown', handleClickOutside)
    }, [])

    return (
        <div ref={ref} className="relative">
            <button
                type="button"
                onClick={() => setOpen(v => !v)}
                className="flex items-center gap-2.5 rounded-full border border-line/15 bg-panel px-3 py-3 text-sm font-medium text-content shadow-xs hover:border-line/25 transition-colors whitespace-nowrap"
            >
                <span className="text-content-muted flex-shrink-0 flex items-center">{icon}</span>
                {selected?.label}
                <ChevronDown size={14} className={cn('text-content-muted transition-transform flex-shrink-0', open && 'rotate-180')} />
            </button>

            {open && (
                <div className="absolute z-20 mt-2 min-w-full w-max rounded-xl border border-line/15 bg-panel shadow-lg overflow-hidden right-0">
                    {options.map(opt => (
                        <button
                            key={opt.value}
                            type="button"
                            onClick={() => { onChange(opt.value); setOpen(false) }}
                            className={cn(
                                'w-full text-left px-4 py-2.5 text-sm transition-colors',
                                opt.value === value
                                    ? 'bg-lime/10 text-lime-deep dark:text-lime font-semibold'
                                    : 'text-content hover:bg-content-muted/5'
                            )}
                        >
                            {opt.label}
                        </button>
                    ))}
                </div>
            )}
        </div>
    )
}