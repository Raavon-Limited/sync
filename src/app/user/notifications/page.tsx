/**
 * ROUTE: /user/notifications
 * ACCESS: authenticated student
 * PURPOSE: Notification inbox, live over Supabase channels.
 *
 * PREFERENCES ARE PERSISTED NOW, per notification kind.
 *   They were four toggles in local state over a table that did not exist, and
 *   this header said so. `notification_preferences` (20260913090000) is that
 *   table, `private.notify` consults it before every insert, and the panel is
 *   its own component. Two kinds - payment and system - are deliberately not
 *   mutable in-app; see PreferencesPanel for why.
 */
'use client';

import { useMemo, useState } from 'react';
import { EmptyState } from '@/components/shared';
import { PreferencesPanel } from './(components)/preferences-panel';
import {
  Home,
  Shirt,
  Settings,
  CheckCheck,
  Clock,
  Info,
  ShoppingBag,
  MessageCircle,
  Wallet,
  Star,
  ShieldCheck,
  Megaphone,
} from 'lucide-react';
import { formatRelative } from '@/lib/utils';
import {
  useNotifications,
  useMarkNotificationsRead,
  useNotificationsRealtime,
} from '@/modules/messaging/hooks';
import { NOTIFICATION_ROLE } from '@/config/dashboard-nav';
import type { NotificationKind } from '@/modules/messaging/types';

/**
 * One icon per real notification kind. The previous four-way union (Hostel /
 * Laundry / Event / System) could not represent most of what the database
 * actually emits   an order or a payment alert had nowhere to land.
 */
const KIND_ICON: Record<NotificationKind, React.ReactNode> = {
  booking: <Home className="text-lime h-4 w-4" />,
  order: <ShoppingBag className="text-lime h-4 w-4" />,
  message: <MessageCircle className="text-lime h-4 w-4" />,
  payment: <Wallet className="text-lime h-4 w-4" />,
  verification: <ShieldCheck className="text-lime h-4 w-4" />,
  delivery: <Shirt className="text-lime h-4 w-4" />,
  review: <Star className="text-lime h-4 w-4" />,
  promotion: <Megaphone className="text-lime h-4 w-4" />,
  system: <Info className="text-content-muted h-4 w-4" />,
};

export default function NotificationsPage() {
  const [activeTab, setActiveTab] = useState<'inbox' | 'preferences'>('inbox');

  // Live: `notifications` is in the realtime publication, so a new alert
  // arrives without a refresh.
  useNotificationsRealtime();
  // The student dashboard's inbox, so the student hat. The same filter as the
  // bell in this header; without it, "View all" showed more than the bell did
  // and "Mark all read" here cleared the landlord and agent badges too.
  const { data: notifications = [], isLoading } = useNotifications({
    pageSize: 50,
    role: NOTIFICATION_ROLE.student,
  });
  const markRead = useMarkNotificationsRead(NOTIFICATION_ROLE.student);

  // No argument marks everything; the RPC returns how many it touched.
  const handleMarkAllRead = () => markRead.mutate(undefined);

  const getIcon = (kind: NotificationKind) => KIND_ICON[kind] ?? KIND_ICON.system;

  const unreadCount = useMemo(
    () => notifications.filter((n) => n.isUnread).length,
    [notifications],
  );

  return (
    <section className="flex flex-col gap-3">
      {/* Eyebrow Path */}
      <h1 className="text-content-muted font-mono text-sm tracking-wide">/ME/NOTIFICATIONS</h1>

      {/* Header Block */}
      <div className="flex w-full flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="font-display text-content mt-2 text-3xl font-medium">
          Your <span className="text-lime">Notifications</span>
        </h2>

        {activeTab === 'inbox' && notifications.length > 0 && (
          <button
            onClick={handleMarkAllRead}
            disabled={unreadCount === 0}
            className="border-line/10 hover:bg-panel/60 bg-panel/30 font-body text-content disabled:hover:bg-panel/30 flex items-center gap-2 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-40"
          >
            <CheckCheck className="h-3.5 w-3.5" />
            Mark all as read
          </button>
        )}
      </div>

      {/* View Selector Tabs */}
      <div className="border-line/10 mt-4 flex gap-2 border-b pb-px">
        <button
          onClick={() => setActiveTab('inbox')}
          className={`font-body relative flex items-center gap-2 pb-3 text-sm font-medium transition-colors ${
            activeTab === 'inbox' ? 'text-content' : 'text-content-muted hover:text-content'
          }`}
        >
          Alerts Inbox
          {unreadCount > 0 && (
            <span className="bg-lime text-ink flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-bold">
              {unreadCount}
            </span>
          )}
          {activeTab === 'inbox' && (
            <div className="bg-lime absolute bottom-0 left-0 h-0.5 w-full" />
          )}
        </button>

        <button
          onClick={() => setActiveTab('preferences')}
          className={`font-body relative flex items-center gap-2 pb-3 text-sm font-medium transition-colors ${
            activeTab === 'preferences' ? 'text-content' : 'text-content-muted hover:text-content'
          }`}
        >
          <Settings className="h-3.5 w-3.5" />
          Preferences
          {activeTab === 'preferences' && (
            <div className="bg-lime absolute bottom-0 left-0 h-0.5 w-full" />
          )}
        </button>
      </div>

      {/* Main Content Area */}
      <section className="mt-6">
        {activeTab === 'inbox' ? (
          isLoading ? (
            <div className="flex flex-col gap-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="bg-ink/5 h-20 animate-pulse rounded-xl" />
              ))}
            </div>
          ) : notifications.length === 0 ? (
            <EmptyState
              title="Inbox is totally clear"
              description="No new updates or alerts are registered to your account right now."
            />
          ) : (
            <div className="flex flex-col gap-3">
              {notifications.map((notification) => (
                <div
                  key={notification.id}
                  className={`border-line/10 flex items-start gap-4 rounded-xl border p-4 transition-all ${
                    notification.isUnread
                      ? 'bg-panel/60 before:bg-lime relative before:absolute before:top-1/4 before:left-0 before:h-1/2 before:w-1 before:rounded-r-md'
                      : 'bg-panel/20 opacity-70'
                  }`}
                >
                  <div className="bg-ink/5 border-line/10 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border">
                    {getIcon(notification.kind)}
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <h4
                        className={`font-body text-sm ${notification.isUnread ? 'text-content font-medium' : 'text-content-muted'}`}
                      >
                        {notification.title}
                      </h4>
                      <span className="font-body text-content-muted flex shrink-0 items-center gap-1 text-[11px]">
                        <Clock className="h-3 w-3" /> {formatRelative(notification.createdAt)}
                      </span>
                    </div>
                    <p className="font-body text-content-muted mt-1 max-w-2xl text-xs leading-relaxed">
                      {notification.body}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )
        ) : (
          /*
           * REAL PREFERENCES, OVER A REAL TABLE.
           *
           * What was here: four Switches over local state - Hostel
           * Allocations, Laundry Metrics, Event Ticket Channels, System
           * Diagnostics - none of which named a notification kind anything
           * in this codebase actually sends. So even once persisted they
           * would have muted nothing. The panel below lists the nine values
           * in `notifications.kind` and writes to notification_preferences,
           * which `private.notify` checks before every insert.
           */
          <PreferencesPanel />
        )}
      </section>
    </section>
  );
}
