'use client'

import { useState } from 'react'
import { cn } from '@/lib/utils'

export function OnlineToggle() {
    const [online, setOnline] = useState(true)

    return (
        <button
            type="button"
            onClick={() => setOnline(v => !v)}
            className={cn(
                'flex items-center gap-2 rounded-full border-2 border-black px-3 py-1.5 text-xs font-bold transition-colors',
                online ? 'bg-lime text-ink' : 'bg-content-muted/10 text-content-muted',
            )}
        >
            <span className={cn('h-2 w-2 rounded-full', online ? 'bg-ink animate-pulse' : 'bg-content-muted')} />
            {online ? 'Online' : 'Offline'}
        </button>
    )
}