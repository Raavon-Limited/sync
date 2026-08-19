'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { LayoutGrid, ClipboardList, User } from 'lucide-react'
import { cn } from '@/lib/utils'

const ITEMS = [
  { href: '/rider', label: 'Dashboard', icon: LayoutGrid },
  { href: '/rider/history', label: 'History', icon: ClipboardList },
  { href: '/rider/profile', label: 'Profile', icon: User },
]

export function RiderBottomNav() {
  const pathname = usePathname()
  return (
    <nav
      aria-label="Rider navigation"
      className="bg-panel border-line/10 fixed inset-x-0 bottom-0 z-40 grid h-16 grid-cols-3 border-t"
    >
      {ITEMS.map(({ href, label, icon: Icon }) => {
        const active = pathname === href
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? 'page' : undefined}
            className={cn(
              'flex flex-col items-center justify-center gap-1 text-[11px] transition-colors',
              active ? 'text-content' : 'text-content-muted hover:text-content',
            )}
          >
            <Icon className={cn('h-5 w-5', active && 'text-lime-deep dark:text-lime')} />
            <span>{label}</span>
          </Link>
        )
      })}
    </nav>
  )
}