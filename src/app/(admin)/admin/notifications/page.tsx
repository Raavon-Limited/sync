/**
 * ROUTE: /admin/notifications
 * ACCESS: admin / super_admin (the proxy guards /admin/*).
 * PURPOSE: The staff inbox   verification requests and anything else routed to
 *          this account.
 *
 * WHY THIS ROUTE HAD TO EXIST
 *   The bell in the dashboard header renders "View all notifications" pointing
 *   at `${basePath}/notifications`, and for staff the base is /admin. Only
 *   /me/notifications was ever built, so on every admin screen that link was a
 *   404   the one place an admin would go to catch up on what they had missed.
 *
 * DELIBERATELY NOT A COPY OF /me/notifications
 *   That page carries a preferences tab whose toggles are not persisted (it
 *   says so). There is no reason to grow a second copy of an unwired control.
 *   This is the inbox and nothing else.
 *
 * CLICKING ONE GOES TO THE WORK. `notifications.href` is a suffix under the
 * dashboard base, so a verification request carries 'vendors' or
 * 'landlord/<slug>' and lands the reviewer on the documents rather than on a
 * list to search.
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

export default function AdminNotificationsPage() {
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
        <Link href="/admin/vendors" className="text-accent-fg hover:underline">
          The verification queue
        </Link>{' '}
        lists every vendor and landlord awaiting a decision.
      </p>
    </section>
  );
}
