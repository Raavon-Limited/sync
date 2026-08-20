// components/ServicesDock.tsx
'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { LucideIcon } from 'lucide-react';
import {
  ClipboardList,
  Compass,
  Heart,
  LayoutDashboard,
  LayoutGrid,
  LogIn,
  MessageCircle,
  Search,
  User,
  UtensilsCrossed,
} from 'lucide-react';

import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
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
  const [sheetOpen, setSheetOpen] = useState(false);

  const isActive = (path: string) => {
    const target = path.startsWith('/') ? path : `/${path}`;
    if (target === '/food' || target === '/around') {
      return pathname === target;
    }
    return pathname === target || pathname?.startsWith(`${target}/`);
  };

  const onModule = MODULES.some((m) => m.slug !== 'around' && m.slug !== 'food' && isActive(m.slug));

  const FOOD_CATEGORIES = [
    'Jollof',
    'Swallow',
    'Fast Food',
    'Breakfast',
    'Drinks',
    'Dessert',
  ];

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

  const tabCount = (isFood ? 1 : 2) + accountTabs.length;

  // Where "your profile" goes per role. Separate from `accountTabs` because the
  // bottom bar drops the account tab in some modes (it's commented out in food,
  // and admins only get a single Admin tab), so the sheet needs its own answer
  // rather than reaching for a tab that may not be there.
  const profile =
    role === 'vendor'
      ? { href: '/vendor', label: 'Your dashboard' }
      : role === 'landlord'
        ? { href: '/landlord', label: 'Your dashboard' }
        : role === 'admin' || role === 'super_admin'
          ? { href: '/admin', label: 'Admin dashboard' }
          : role === 'student'
            ? { href: '/me', label: 'Your profile' }
            : { href: '/login', label: 'Sign in' };
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
            {MODULES.map(({ slug, label, icon: Icon }) => {
              const active = isActive(slug);
              return (
                <Link
                  key={slug}
                  href={`/${slug}`}
                  aria-current={active ? 'page' : undefined}
                  className={cn(
                    'inline-flex h-9 shrink-0 items-center gap-2 rounded-full px-3 text-sm transition-colors',
                    active
                      ? 'bg-lime text-ink font-medium'
                      : 'text-foreground hover:bg-ink/5 border-line/15 border',
                  )}
                >
                  <Icon className="h-3.5 w-3.5" aria-hidden="true" />
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

      {/* ── Mobile bottom tab bar + module sheet (<md) ─────────────── */}
      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <nav
          aria-label="Primary"
          className="bg-panel border-line/10 fixed inset-x-0 bottom-0 z-40 grid h-16 border-t md:hidden"
          style={{ gridTemplateColumns: `repeat(${tabCount}, minmax(0, 1fr))` }}
        >
          {/* Home tab */}
          <TabLink
            href={isFood ? '/food' : '/around'}
            label="Home"
            icon={isFood ? UtensilsCrossed : Compass}
            active={isFood ? pathname === '/food' : pathname === '/around'}
          />

          {/* Browse sheet trigger — hidden when in food (food has Search instead) */}
          {!isFood && (
            <SheetTrigger asChild>
              <button type="button" className={tabClass(onModule)}>
                <TabIcon icon={LayoutGrid} active={onModule} />
                <span>Browse</span>
              </button>
            </SheetTrigger>
          )}

          {accountTabs.map((t) => (
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

        {/* Browse sheet — only relevant outside food */}
        <SheetContent side="bottom" className="rounded-t-2xl">
          <SheetHeader>
            <SheetTitle className="font-display text-content text-lg">
              Browse Sync
            </SheetTitle>
          </SheetHeader>

          <div className="grid grid-cols-3 gap-3 px-4">
            {MODULES.map(({ slug, label, icon: Icon }) => {
              const active = isActive(slug);
              return (
                <Link
                  key={slug}
                  href={`/${slug}`}
                  onClick={() => setSheetOpen(false)}
                  aria-current={active ? 'page' : undefined}
                  className={cn(
                    'flex flex-col items-center gap-2 rounded-2xl border p-4 text-center text-sm transition-colors',
                    active
                      ? 'bg-lime text-ink border-transparent font-medium'
                      : 'border-line/10 text-content hover:bg-ink/5',
                  )}
                >
                  <Icon className="h-5 w-5" />
                  <span>{label}</span>
                </Link>
              );
            })}
          </div>

          {/* Account. The bottom bar has no room for a profile tab in every
              mode, so the sheet always carries one. */}
          <div className="mt-5 px-4">
            <p className="text-content-muted mb-2 font-mono text-[11px] tracking-wider uppercase">
              Account
            </p>
            <Link
              href={profile.href}
              onClick={() => setSheetOpen(false)}
              aria-current={isActive(profile.href) ? 'page' : undefined}
              className={cn(
                'flex items-center gap-3 rounded-2xl border px-4 py-3 text-sm transition-colors',
                isActive(profile.href)
                  ? 'bg-lime text-ink border-transparent font-medium'
                  : 'border-line/10 text-content hover:bg-ink/5',
              )}
            >
              <span
                className={cn(
                  'flex h-9 w-9 shrink-0 items-center justify-center rounded-full',
                  isActive(profile.href) ? 'bg-ink/10' : 'bg-ink/5',
                )}
              >
                {role ? (
                  <User className="h-4 w-4" aria-hidden="true" />
                ) : (
                  <LogIn className="h-4 w-4" aria-hidden="true" />
                )}
              </span>
              <span className="font-medium">{profile.label}</span>
            </Link>
          </div>

          <div className="mt-5 px-4 pb-2">
            <p className="text-content-muted mb-2 font-mono text-[11px] tracking-wider uppercase">Your area</p>
            <LocationSelector variant="inline" onNavigate={() => setSheetOpen(false)} />
          </div>
        </SheetContent>
      </Sheet>
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