/**
 * MobileMenu - hamburger trigger + full-viewport overlay menu for the
 * marketing header below xl. Shows the SAME groups as the desktop nav
 * (config/marketing-nav) as collapsible sections, the location picker, and
 * the auth/CTA actions plus a theme toggle. Built on Radix Dialog so we get focus trapping,
 * Escape-to-close, and body scroll lock for free.
 *
 * Visible only below `xl`; the desktop header shows the inline nav.
 */
'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import * as Dialog from '@radix-ui/react-dialog';
import { ArrowRight, ChevronDown, LayoutDashboard, LogOut, Menu, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ThemeToggle } from '@/components/ui/theme-toggle';
import { toast } from '@/components/ui/toast';
import { TOP_NAV, isGroup } from '@/config/marketing-nav';
import { NavIcon } from './nav-icon';
import { CampusLocationPicker } from './campus-location-picker';
import { SyncLogo } from '@/components/brand/sync-logo';
import { AFTER_SIGN_OUT } from '@/config/site';
import { signOut } from '@/modules/auth/actions';
// Canonical role union - kept in one place so new roles (e.g. landlord) can't
// silently drift out of sync with the proxy gate.
import type { Role } from '@/modules/auth/types';

export function MobileMenu({
  signedIn = false,
  name,
  email,
  role,
  handle,
}: {
  signedIn?: boolean;
  name?: string;
  email?: string;
  role?: Role;
  handle?: string;
}) {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const close = () => setOpen(false);
  // Students/vendors/landlords use their name-based handle URL; admins keep /admin.
  const isAdmin = role === 'admin' || role === 'super_admin';
  const dashboardHref = isAdmin
    ? '/admin'
    : handle
      ? `/${handle}`
      : role === 'landlord'
        ? '/landlord'
        : role === 'vendor'
          ? '/vendor'
          : '/user';

  async function handleSignOut() {
    close();
    const res = await signOut();
    if (!res.ok) {
      toast(res.error);
      return;
    }
    router.push(AFTER_SIGN_OUT);
    router.refresh();
  }

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger asChild>
        <button
          type="button"
          aria-label="Open menu"
          className="text-foreground hover:bg-foreground/5 inline-flex h-10 w-10 items-center justify-center rounded-full transition-colors xl:hidden"
        >
          <Menu className="h-5 w-5" />
        </button>
      </Dialog.Trigger>

      <Dialog.Portal>
        {/* h-dvh, NOT h-screen.
            `h-screen` is 100vh, which on iOS Safari means the height with the
            browser toolbars HIDDEN - taller than what you can actually see. The
            overlay therefore ran off the bottom of the screen and took the
            sticky CTA footer with it: the nav scrolled fine, but the buttons
            were never reachable because they were below the fold, outside the
            one element that scrolls. `dvh` tracks the visible viewport as the
            toolbars collapse, so the footer stays on screen. */}
        <Dialog.Content className="bg-surface text-foreground data-[state=open]:animate-in data-[state=closed]:animate-out fixed inset-0 z-50 flex h-dvh w-full flex-col xl:hidden">
          <Dialog.Title className="sr-only">Menu</Dialog.Title>
          <Dialog.Description className="sr-only">
            Sync navigation, account actions, and theme toggle.
          </Dialog.Description>

          {/* Top bar - logo + theme toggle + close */}
          <div className="border-line/5 flex h-16 shrink-0 items-center justify-between border-b px-6">
            <Link
              href="/"
              onClick={close}
              className="flex items-center gap-2"
              aria-label="Sync home"
            >
              <SyncLogo height={20} className="text-foreground" />
            </Link>
            <div className="flex items-center gap-1">
              <ThemeToggle />
              <Dialog.Close asChild>
                <button
                  type="button"
                  aria-label="Close menu"
                  className="text-foreground hover:bg-foreground/5 inline-flex h-10 w-10 items-center justify-center rounded-full transition-colors"
                >
                  <X className="h-5 w-5" />
                </button>
              </Dialog.Close>
            </div>
          </div>

          {/* Nav - the desktop groups as native <details>, so they open with
              no JS and are keyboard-operable for free. Explore starts open:
              it is what most people opened the menu for. */}
          <nav aria-label="Mobile" className="flex-1 overflow-y-auto px-6 py-6" data-lenis-prevent>
            <CampusLocationPicker className="mb-5 w-full justify-start" />
            <ul className="flex flex-col">
              {TOP_NAV.map((n) =>
                isGroup(n) ? (
                  <li key={n.label} className="border-line/5 border-b">
                    <details open={n.label === 'Explore'} className="group">
                      <summary className="font-display text-card flex cursor-pointer list-none items-center justify-between py-4 [&::-webkit-details-marker]:hidden">
                        {n.label}
                        <ChevronDown className="text-content-muted h-4 w-4 transition-transform group-open:rotate-180" aria-hidden="true" />
                      </summary>
                      <ul className="flex flex-col gap-1 pb-4">
                        {n.items.map((it) => {
                          const inner = (
                            <>
                              <span className={it.soon ? 'text-content-muted' : 'text-accent-fg'}>
                                <NavIcon name={it.icon} size={18} />
                              </span>
                              <span className="min-w-0 flex-1">
                                <span className="flex items-center gap-2 text-sm font-semibold">
                                  {it.label}
                                  {it.soon && (
                                    <span className="bg-lime text-ink rounded-full px-1.5 font-mono text-[9px] tracking-wider uppercase">
                                      Soon
                                    </span>
                                  )}
                                </span>
                                {it.desc && <span className="text-content-muted block truncate text-xs">{it.desc}</span>}
                              </span>
                            </>
                          );
                          return (
                            <li key={it.label}>
                              {it.href && !it.soon ? (
                                <Link href={it.href} onClick={close} className="hover:bg-surface-deep flex min-h-11 items-center gap-3 rounded-xl px-2 py-2">
                                  {inner}
                                </Link>
                              ) : (
                                <div aria-disabled="true" className="flex min-h-11 items-center gap-3 px-2 py-2 opacity-80">
                                  {inner}
                                </div>
                              )}
                            </li>
                          );
                        })}
                      </ul>
                    </details>
                  </li>
                ) : (
                  <li key={n.label} className="border-line/5 border-b">
                    <Link
                      href={n.href}
                      onClick={close}
                      className="font-display text-card hover:text-accent-fg flex items-center justify-between py-4 transition-colors"
                    >
                      {n.label}
                      <ArrowRight className="text-content-muted h-4 w-4" aria-hidden="true" />
                    </Link>
                  </li>
                ),
              )}
            </ul>
          </nav>

          {/* Sticky auth/CTA footer.
              pb clears the iOS home indicator, which otherwise sits on top of
              the bottom button. */}
          <div
            className="border-line/5 bg-surface flex shrink-0 flex-col gap-2 border-t px-6 pt-5"
            style={{ paddingBottom: 'calc(1.25rem + env(safe-area-inset-bottom))' }}
          >
            {signedIn ? (
              <>
                <div className="flex items-center gap-3 pb-1">
                  <span className="bg-lime text-ink font-display flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm">
                    {(name ?? 'You').charAt(0).toUpperCase()}
                  </span>
                  <div className="min-w-0">
                    <p className="text-foreground truncate text-sm font-medium">{name}</p>
                    <p className="text-content-muted truncate text-xs">{email}</p>
                  </div>
                </div>
                {/* Two actions, so they share one row instead of stacking -
                    half the footer height, and nothing gets pushed off. */}
                <div className="flex items-center gap-2">
                  <Button
                    asChild
                    variant="outline"
                    size="lg"
                    onClick={close}
                    className="text-foreground border-foreground/20 hover:bg-foreground/10 min-w-0 flex-1"
                  >
                    <Link href={dashboardHref}>
                      <LayoutDashboard />
                      <span className="truncate">
                        {role === 'admin' ? 'Admin' : 'Dashboard'}
                      </span>
                    </Link>
                  </Button>
                  <Button
                    variant="outline"
                    size="lg"
                    onClick={handleSignOut}
                    className="text-coral border-coral/30 hover:bg-coral/10 min-w-0 flex-1"
                  >
                    <LogOut /> <span className="truncate">Sign out</span>
                  </Button>
                </div>
              </>
            ) : (
              <div className="flex items-center gap-2">
                <Button asChild size="lg" onClick={close} className="min-w-0 flex-[1.5]">
                  <Link href="/for-vendors">
                    <span className="truncate">Become a vendor</span>
                    <ArrowRight />
                  </Link>
                </Button>
                <Button
                  asChild
                  variant="outline"
                  size="lg"
                  onClick={close}
                  className="text-foreground border-foreground/20 hover:bg-foreground/10 min-w-0 flex-1"
                >
                  <Link href="/login">
                    <span className="truncate">Sign in</span>
                  </Link>
                </Button>
              </div>
            )}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
