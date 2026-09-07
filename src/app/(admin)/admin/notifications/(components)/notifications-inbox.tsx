/**
 * The staff inbox itself   client-side because it subscribes to realtime and
 * marks rows read on click.
 *
 * SPLIT OUT OF page.tsx SO THE ROUTE CAN BE GUARDED.
 *   It was a bare client component exported straight as the page, which meant
 *   there was no server render in which to ask whether the caller is staff
 *   and /admin was not gated by the proxy either, so the console shell drew
 *   for anybody signed in. The page is a server component now and this is what
 *   it renders once requireStaff() has answered.
 */
'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  BedDouble,
  CheckCheck,
  Clock,
  Info,
  MessageCircle,
  ShieldCheck,
  ShoppingBag,
  Star,
  Tag,
  Truck,
  Wallet,
  type LucideIcon,
} from 'lucide-react';
import { EmptyState } from '@/components/shared';
import { formatRelative } from '@/lib/utils';
import {
  useNotifications,
  useMarkNotificationsRead,
  useNotificationsRealtime,
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

export function NotificationsInbox() {
  const router = useRouter();

  // Live: `notifications` is in the realtime publication, so a verification
  // request submitted while this page is open arrives without a refresh.
  useNotificationsRealtime();
  const { data: notifications = [], isLoading } = useNotifications({ pageSize: 50 });
  const markRead = useMarkNotificationsRead();

  const unread = notifications.filter((n) => n.isUnread).length;

  function open(n: Notification) {
    if (n.isUnread) markRead.mutate([n.id]);
    if (n.href) router.push(`/admin/${n.href}`);
  }

  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-content-muted font-mono text-sm tracking-wide">
            ADMIN / NOTIFICATIONS
          </h1>
          <h2 className="font-display text-content mt-2 text-3xl font-medium">
            What needs <span className="text-lime-deep">you.</span>
          </h2>
        </div>

        {unread > 0 && (
          <button
            type="button"
            onClick={() => markRead.mutate(undefined)}
            disabled={markRead.isPending}
            className="border-line/10 hover:bg-panel/60 bg-panel/30 text-content flex items-center gap-2 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-40"
          >
            <CheckCheck className="size-3.5" />
            Mark all as read
          </button>
        )}
      </div>

      {isLoading ? (
        <div className="flex flex-col gap-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="bg-ink/5 h-20 animate-pulse rounded-xl" />
          ))}
        </div>
      ) : notifications.length === 0 ? (
        <EmptyState
          title="Nothing waiting"
          description="Verification requests and other alerts for your account land here."
        />
      ) : (
        <div className="flex flex-col gap-3">
          {notifications.map((n) => {
            const Icon = KIND_ICON[n.kind] ?? Info;
            return (
              <button
                key={n.id}
                type="button"
                onClick={() => open(n)}
                className={`border-line/10 hover:border-line/25 flex w-full items-start gap-4 rounded-xl border p-4 text-left transition-colors ${
                  n.isUnread ? 'bg-panel/60' : 'bg-panel/20 opacity-70'
                }`}
              >
                <span className="bg-ink/5 border-line/10 text-content-muted flex size-9 shrink-0 items-center justify-center rounded-lg border">
                  <Icon className="size-4" aria-hidden="true" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <p
                      className={`truncate text-sm ${n.isUnread ? 'text-content font-medium' : 'text-content-muted'}`}
                    >
                      {n.title}
                    </p>
                    <span className="text-content-muted flex shrink-0 items-center gap-1 text-[11px]">
                      <Clock className="size-3" /> {formatRelative(n.createdAt)}
                    </span>
                  </div>
                  <p className="text-content-muted mt-1 text-xs leading-relaxed">{n.body}</p>
                </div>
              </button>
            );
          })}
        </div>
      )}

      <p className="text-content-muted text-xs">
        Reviewing a business?{' '}
        <Link href="/admin/accounts" className="text-accent-fg hover:underline">
          The verification queue
        </Link>{' '}
        lists every vendor and landlord awaiting a decision.
      </p>
    </section>
  );
}
