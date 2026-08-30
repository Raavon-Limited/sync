/**
 * NotificationBell - bell button + dropdown of recent notifications, with an
 * unread count and a "View all" link. Lives in the dashboard header, so it is
 * the quick-access notification surface on every screen.
 *
 * LIVE, NOT POLLED
 * `useNotificationsRealtime()` opens one filtered channel for the signed-in user
 * and invalidates the cache on insert. The header mounts once per navigation, so
 * this is one socket per session rather than one per component.
 *
 * ICONS ARE NOT STORED
 * The database keeps `kind`; the mapping from kind to a Lucide icon lives here.
 * Storing the icon name would mean a data migration every time the design
 * changes, and would let a row reference a component that no longer exists.
 */
'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Bell,
  BedDouble,
  MessageCircle,
  Wallet,
  ShieldCheck,
  Truck,
  Star,
  Tag,
  Info,
  ShoppingBag,
  type LucideIcon,
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn, formatRelative } from '@/lib/utils';
import { OPEN_CHAT_EVENT } from '@/lib/chat-events';
import {
  useNotifications,
  useMarkNotificationsRead,
  useNotificationsRealtime,
  useUnreadCounts,
} from '@/modules/messaging/hooks';
import type { Notification, NotificationKind } from '@/modules/messaging/types';

const KIND_ICON: Record<NotificationKind, LucideIcon> = {
  booking: BedDouble,
  order: ShoppingBag,
  message: MessageCircle,
  payment: Wallet,
  verification: ShieldCheck,
  delivery: Truck,
  review: Star,
  promotion: Tag,
  system: Info,
};

export function NotificationBell({ basePath = '/me' }: { basePath?: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  useNotificationsRealtime();

  const { data: notifications = [], isLoading } = useNotifications({ pageSize: 12 });
  const { data: counts } = useUnreadCounts();
  const markRead = useMarkNotificationsRead();

  // Prefer the RPC's count: the dropdown only holds the most recent page, so
  // counting unread within it would under-report once there are more than a
  // page of them.
  const unread = counts?.notifications ?? notifications.filter((n) => n.isUnread).length;

  function onSelect(n: Notification) {
    if (n.isUnread) markRead.mutate([n.id]);
    setOpen(false);

    if (n.action === 'chat') {
      window.dispatchEvent(new CustomEvent(OPEN_CHAT_EVENT));
    } else if (n.href) {
      router.push(`${basePath}/${n.href}`);
    }
  }

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={`Notifications${unread ? `, ${unread} unread` : ''}`}
          className="border-line text-content hover:bg-ink/5 relative inline-flex size-10 items-center justify-center rounded-full border transition-colors"
        >
          <Bell className="size-5" />
          {unread > 0 && (
            <span className="bg-coral text-cream absolute -top-1 -right-1 flex size-4 items-center justify-center rounded-full text-[10px] font-semibold">
              {unread > 9 ? '9+' : unread}
            </span>
          )}
        </button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-104 max-w-[calc(100vw-1.5rem)] p-0">
        <div className="border-line/10 flex items-center justify-between border-b px-4 py-3">
          <p className="text-content text-sm font-medium">Notifications</p>
          {unread > 0 && (
            <button
              type="button"
              onClick={() => markRead.mutate(undefined)}
              disabled={markRead.isPending}
              className="text-accent-fg text-xs font-medium hover:underline disabled:opacity-50"
            >
              Mark all read
            </button>
          )}
        </div>

        <div className="max-h-112 overflow-y-auto">
          {isLoading && (
            <p className="text-content-muted px-4 py-6 text-center text-sm">Loading…</p>
          )}

          {!isLoading && notifications.length === 0 && (
            <p className="text-content-muted px-4 py-6 text-center text-sm">
              Nothing yet. We&apos;ll let you know when something happens.
            </p>
          )}

          {notifications.map((n) => {
            const Icon = KIND_ICON[n.kind] ?? Info;
            return (
              <button
                key={n.id}
                type="button"
                onClick={() => onSelect(n)}
                className={cn(
                  'border-line/5 hover:bg-ink/5 flex w-full gap-3 border-b px-4 py-3 text-left transition-colors last:border-b-0',
                  n.isUnread && 'bg-lime/5',
                )}
              >
                <span className="bg-ink/5 text-content-muted flex size-9 shrink-0 items-center justify-center rounded-lg">
                  <Icon className="size-4" aria-hidden="true" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="text-content truncate text-sm font-medium">{n.title}</p>
                    {n.isUnread && <span className="bg-coral size-1.5 shrink-0 rounded-full" />}
                  </div>
                  <p className="text-content-muted text-xs">{n.body}</p>
                  <p className="text-content-muted mt-0.5 text-[11px]">
                    {formatRelative(n.createdAt)}
                  </p>
                </div>
              </button>
            );
          })}
        </div>

        <div className="border-line/10 border-t px-4 py-2.5 text-center">
          <Link
            href={`${basePath}/notifications`}
            onClick={() => setOpen(false)}
            className="text-accent-fg text-xs font-medium hover:underline"
          >
            View all notifications
          </Link>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
