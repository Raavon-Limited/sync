// components/ServicesDock.tsx
'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { LucideIcon } from 'lucide-react';
import {
  ClipboardList,
  Compass,
  Heart,
  LayoutDashboard,
  LogIn,
  MessageCircle,
  Search,
  Sparkles,
  User,
  UtensilsCrossed,
} from 'lucide-react';

import { SearchBar } from '@/components/shared/search-bar';
import { LocationSelector } from '@/components/shared/location-selector';
import { MODULES } from '@/config/modules';
import { cn } from '@/lib/utils';
// Canonical role union - kept in one place so new roles (e.g. landlord) can't
// silently drift out of sync with the proxy gate.
import type { Role } from '@/modules/auth/types';

interface ServicesDockProps {
  role?: Role;
}

export function ServicesDock({ role }: ServicesDockProps) {
  const pathname = usePathname();
  const isFood = pathname.startsWith('/food');

  const isActive = (path: string) => {
    const target = path.startsWith('/') ? path : `/${path}`;
    if (target === '/food' || target === '/around') {
      return pathname === target;
    }
    return pathname === target || pathname?.startsWith(`${target}/`);
  };



  const accountTabs: {
    href: string;
    label: string;
    icon: LucideIcon;
    badge?: number;
  }[] =
    isFood
      ? [
          { href: '/food/search',    label: 'Search',    icon: Search },
          { href: '/food/orders',    label: 'Orders',    icon: ClipboardList },
          { href: '/food/favorites', label: 'Saved',     icon: Heart },
          // { href: '/me',             label: 'You',       icon: User },
        ]
      : role === 'vendor'
        ? [
            { href: '/vendor/orders', label: 'Orders',  icon: ClipboardList },
            { href: '/vendor/inbox',  label: 'Inbox',   icon: MessageCircle, badge: 2 },
            { href: '/vendor',        label: 'You',     icon: LayoutDashboard },
          ]
        : role === 'landlord'
          ? [
              { href: '/landlord/requests', label: 'Requests', icon: ClipboardList },
              { href: '/landlord/inbox',    label: 'Inbox',    icon: MessageCircle, badge: 2 },
              { href: '/landlord',          label: 'You',      icon: LayoutDashboard },
            ]
          : role === 'admin' || role === 'super_admin'
            ? [{ href: '/admin', label: 'Admin', icon: LayoutDashboard }]
            : role === 'student'
              ? [
                  { href: '/me/saved',    label: 'Saved',  icon: Heart },
                  { href: '/me/messages', label: 'Chats',  icon: MessageCircle, badge: 3 },
                  { href: '/me',          label: 'You',    icon: User },
                ]
              : [{ href: '/login', label: 'Sign in', icon: LogIn }];

  // The bar is [ ...left, AI, ...right ]. Home is just the first tab rather
  // than a special case, so the split stays correct for every role - admins
  // get two tabs, students four - and the AI button is always the middle.
  const tabs = [
    {
      href: isFood ? '/food' : '/around',
      label: 'Home',
      icon: isFood ? UtensilsCrossed : Compass,
      badge: undefined as number | undefined,
    },
    ...accountTabs,
  ];
  const split = Math.ceil(tabs.length / 2);
  const leftTabs = tabs.slice(0, split);
  const rightTabs = tabs.slice(split);

  return (
    <>
      {/* ── Service rail ───────────────────────────────────────────────
          The module links are desktop-only: on mobile the bottom tab bar and
          the Browse sheet already cover navigation. The LOCATION control is not
          desktop-only, though. It used to be, which left mobile with no visible
          way to change area - the only route was Browse -> scroll to "Your
          area", and on /food the Browse tab is hidden entirely, so there was no
          route at all. The bar itself therefore renders at every width and only
          its <nav> collapses. */}
      <div className="border-line/5 border-b">
        <div className="mx-auto flex max-w-7xl items-center justify-end gap-2 px-4 py-2 md:gap-3 md:px-6 md:py-3">
          {/* Mobile-only search. The desktop header keeps its own centred
              SearchBar; here the pair shares one row as [search][location].
              `min-w-0` matters - without it the flex child refuses to shrink
              below its content width and pushes the location pill off screen. */}
          {/* h-9 overrides SearchBar's default h-12 (twMerge keeps the last
              conflicting class) so it matches the location pill beside it. */}
          <SearchBar className="h-9 min-w-0 flex-1 md:hidden" />

          <nav
            aria-label="Sync services"
            className="-mx-1 hidden flex-1 items-center gap-1 overflow-x-auto px-1 [scrollbar-width:none] md:flex [&::-webkit-scrollbar]:hidden"
          >
            {MODULES.map(({ slug, label }) => {
              const active = isActive(slug);
              return (
                <Link
                  key={slug}
                  href={`/${slug}`}
                  aria-current={active ? 'page' : undefined}
                  className={cn(
                    'inline-flex h-9 shrink-0 items-center rounded-full px-3 text-sm transition-colors',
                    active
                      ? 'bg-lime text-ink font-medium'
                      : 'text-foreground hover:bg-ink/5 border-line/15 border',
                  )}
                >
                  <span className="whitespace-nowrap">{label}</span>
                </Link>
              );
            })}
          </nav>

          {/* The one location control. Same component, same state, as the one
              in the sheet below and anywhere else that scopes a feed. */}
          <LocationSelector />
        </div>
      </div>

      {/* ── Mobile bottom tab bar (<md) ──────────────────────────────
          Floating: inset from the edges and rounded, rather than a full-width
          bar welded to the bottom. `bottom` includes env(safe-area-inset-bottom)
          so it clears the iPhone home indicator instead of sitting under it.

          The AI button is the centre of the bar by construction: the tabs are
          split into two halves around it, so it stays centred whatever the
          role-dependent tab count is. */}
      <nav
        aria-label="Primary"
        className="border-line/10 bg-panel/95 shadow-pop fixed inset-x-4 z-40 flex h-16 items-center justify-around rounded-full border backdrop-blur md:hidden"
        style={{ bottom: 'calc(1rem + env(safe-area-inset-bottom))' }}
      >
        {leftTabs.map((t) => (
          <TabLink
            key={t.href}
            href={t.href}
            label={t.label}
            icon={t.icon}
            badge={t.badge}
            active={isActive(t.href)}
          />
        ))}

        {/* Ask Sync. Raised out of the bar so it reads as the primary action
            rather than a fifth tab. */}
        <Link
          href="/ai"
          aria-label="Ask Sync"
          aria-current={isActive('/ai') ? 'page' : undefined}
          className={cn(
            'bg-lime text-ink -mt-6 flex h-14 w-14 shrink-0 items-center justify-center rounded-full shadow-lg ring-4 transition-transform active:scale-95',
            isActive('/ai') ? 'ring-lime/30' : 'ring-surface',
          )}
        >
          <Sparkles className="h-6 w-6" aria-hidden="true" />
        </Link>

        {rightTabs.map((t) => (
          <TabLink
            key={t.href}
            href={t.href}
            label={t.label}
            icon={t.icon}
            badge={t.badge}
            active={isActive(t.href)}
          />
        ))}
      </nav>
    </>
  );
}

function tabClass(active: boolean) {
  return cn(
    'flex flex-col items-center justify-center gap-1 text-[11px] transition-colors',
    active ? 'text-content' : 'text-content-muted hover:text-content',
  );
}

function TabIcon({ icon: Icon, active, badge }: { icon: LucideIcon; active: boolean; badge?: number }) {
  return (
    <span className="relative">
      <Icon className={cn('h-5 w-5', active && 'text-lime-deep dark:text-lime')} aria-hidden="true" />
      {badge ? (
        <span className="bg-lime text-ink absolute -top-1.5 -right-2 inline-flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[9px] font-bold">
          {badge > 99 ? '99+' : badge}
        </span>
      ) : null}
    </span>
  );
}

function TabLink({
  href,
  label,
  icon,
  active,
  badge,
}: {
  href: string;
  label: string;
  icon: LucideIcon;
  active: boolean;
  badge?: number;
}) {
  return (
    <Link href={href} aria-current={active ? 'page' : undefined} className={tabClass(active)}>
      <TabIcon icon={icon} active={active} badge={badge} />
      <span>{label}</span>
    </Link>
  );
}