/**
 * MarketingNav - the desktop link row of the public header (lg and up).
 *
 * Groups open on hover AND on click. Hover alone fails on touch laptops and for
 * keyboard users; click alone feels dead on a mouse. Radix Popover gives the
 * keyboard, Escape and outside-click handling, and we drive `open` ourselves so
 * the hover can share it.
 *
 * The items come from config/marketing-nav, the same list the mobile menu
 * reads. A `soon` item renders as a muted row with a pill and no link.
 */
'use client';

import { useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import * as Popover from '@radix-ui/react-popover';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { TOP_NAV, isGroup, type NavGroup } from '@/config/marketing-nav';
import { NavIcon } from './nav-icon';

const linkCls =
  'text-foreground hover:bg-ink/5 dark:hover:bg-cream/5 flex h-9 items-center gap-1 rounded-full px-3 text-sm font-medium transition-colors';

export function MarketingNav({ className }: { className?: string }) {
  const path = usePathname();
  return (
    <nav aria-label="Primary" className={cn('items-center gap-0.5', className)}>
      {TOP_NAV.map((n) =>
        isGroup(n) ? (
          <Group key={n.label} group={n} />
        ) : (
          <Link
            key={n.label}
            href={n.href}
            aria-current={path === n.href ? 'page' : undefined}
            className={cn(linkCls, path === n.href && 'bg-ink/5 dark:bg-cream/5')}
          >
            {n.label}
          </Link>
        ),
      )}
    </nav>
  );
}

function Group({ group }: { group: NavGroup }) {
  const [open, setOpen] = useState(false);
  // A short close delay so the pointer can cross the gap between the trigger
  // and the panel without the panel vanishing under it.
  const t = useRef<ReturnType<typeof setTimeout> | null>(null);
  const enter = () => {
    if (t.current) clearTimeout(t.current);
    setOpen(true);
  };
  const leave = () => {
    t.current = setTimeout(() => setOpen(false), 120);
  };

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>
        <button
          type="button"
          onPointerEnter={(e) => e.pointerType === 'mouse' && enter()}
          onPointerLeave={(e) => e.pointerType === 'mouse' && leave()}
          className={cn(linkCls, open && 'bg-ink/5 dark:bg-cream/5')}
        >
          {group.label}
          <ChevronDown
            className={cn('size-3.5 opacity-60 transition-transform', open && 'rotate-180')}
            aria-hidden="true"
          />
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          align="start"
          sideOffset={10}
          onPointerEnter={enter}
          onPointerLeave={leave}
          className={cn(
            'bg-panel text-foreground border-line/10 shadow-pop z-50 rounded-3xl border p-3',
            group.wide ? 'w-[38rem]' : 'w-80',
          )}
        >
          <p className="eyebrow text-content-muted px-3 pt-1 pb-2">{group.kicker}</p>
          <ul className={cn('grid gap-1', group.wide && 'grid-cols-2')}>
            {group.items.map((it) => {
              const body = (
                <>
                  <span
                    className={cn(
                      'flex size-9 shrink-0 items-center justify-center rounded-xl',
                      it.soon ? 'bg-surface-deep text-content-muted' : 'bg-sage/35 text-ink dark:text-cream',
                    )}
                  >
                    <NavIcon name={it.icon} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2 text-sm font-semibold">
                      {it.label}
                      {it.soon && (
                        <span className="bg-lime text-ink rounded-full px-1.5 py-px font-mono text-[9px] tracking-wider uppercase">
                          Soon
                        </span>
                      )}
                    </span>
                    {it.desc && (
                      <span className="text-content-muted block truncate text-xs">{it.desc}</span>
                    )}
                  </span>
                </>
              );
              return (
                <li key={it.label}>
                  {it.href && !it.soon ? (
                    <Link
                      href={it.href}
                      onClick={() => setOpen(false)}
                      className="hover:bg-surface-deep flex items-center gap-3 rounded-2xl p-2 transition-colors"
                    >
                      {body}
                    </Link>
                  ) : (
                    <div aria-disabled="true" className="flex cursor-default items-center gap-3 rounded-2xl p-2 opacity-80">
                      {body}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
