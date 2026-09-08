'use client';

/**
 * What has actually happened on this account.
 *
 * IT WAS FOUR HARDCODED LINES. "You saved Pipeline Court · 2h ago", "Mama
 * Yetunde replied · Yesterday", "Booking request sent · Yesterday", "3 new
 * hostels match your search · 2d ago" - a const array in /user/page.tsx,
 * identical for every student on Sync, describing events that never happened to
 * them. Two of the four named a person and a property that do not exist in
 * their data at all.
 *
 * DRIVEN BY NOTIFICATIONS, NOT `activity_log`. There is an `activity_log` table
 * from 0006 with a proper kind vocabulary, and nothing has ever written a row
 * to it - so reading it would produce a permanently empty feed. Notifications
 * are the real record of what happened to this account and they are already
 * populated, already scoped by RLS, and already live over realtime.
 *
 * NOTHING TO SHOW MEANS NOTHING RENDERED, heading included. A new student's
 * dashboard should not carry an empty panel captioned "recent activity" - the
 * absence of history is not information worth a third of a column.
 */

import Link from 'next/link';
import {
  ArrowRight,
  BedDouble,
  CheckCircle2,
  Info,
  MessageCircle,
  Megaphone,
  ShieldCheck,
  ShoppingBag,
  Star,
  Truck,
  Wallet,
} from 'lucide-react';
import { formatRelative } from '@/lib/utils';
import { Button } from '@/components/ui';
import { useNotifications } from '@/modules/messaging/hooks';
import type { NotificationKind } from '@/modules/messaging/types';

const ICON: Record<NotificationKind, React.ReactNode> = {
  booking: <BedDouble className="size-4" />,
  order: <ShoppingBag className="size-4" />,
  message: <MessageCircle className="size-4" />,
  payment: <Wallet className="size-4" />,
  verification: <ShieldCheck className="size-4" />,
  delivery: <Truck className="size-4" />,
  review: <Star className="size-4" />,
  promotion: <Megaphone className="size-4" />,
  system: <Info className="size-4" />,
};

export function RecentActivity({ basePath = '/user' }: { basePath?: string }) {
  const { data: items = [], isLoading } = useNotifications({ pageSize: 5 });

  if (isLoading) {
    return <div className="bg-ink/5 h-56 animate-pulse rounded-2xl" />;
  }

  if (items.length === 0) return null;

  return (
    <div>
      <div className="mb-4 flex h-9 items-center justify-between gap-3">
        <h2 className="text-content-muted font-mono text-sm tracking-wide">RECENT ACTIVITY</h2>
        <Button
          asChild
          variant="outline"
          className="text-content-muted shrink-0 border-none font-light"
        >
          <Link href={`${basePath}/notifications`}>
            All <ArrowRight className="ml-1 size-4" />
          </Link>
        </Button>
      </div>

      <div className="bg-panel border-line/20 rounded-2xl border border-dashed">
        {items.map((item, index) => (
          <div
            key={item.id}
            className={`flex items-start gap-3 px-4 py-4 ${
              index !== items.length - 1 ? 'border-line/10 border-b border-dashed' : ''
            }`}
          >
            <span className="text-content mt-0.5 shrink-0">
              {ICON[item.kind] ?? <CheckCircle2 className="size-4" />}
            </span>
            <div className="min-w-0">
              <p className="text-content text-sm font-medium">{item.title}</p>
              <p className="text-content-muted text-xs">{formatRelative(item.createdAt)}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
