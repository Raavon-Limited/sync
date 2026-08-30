/**
 * ROUTE: /me/notifications
 * ACCESS: authenticated student
 * PURPOSE: Notification inbox, live over Supabase channels.
 *
 * PREFERENCES ARE NOT PERSISTED, AND THE UI SAYS SO
 *   There is no notification-preferences table in this schema — only
 *   `public.devices`, which holds push tokens. The toggles below are local
 *   state, and the tab states that plainly rather than pretending a switch was
 *   saved. Silently discarding a preference someone set is worse than telling
 *   them it is not wired yet.
 */
'use client';

import { useMemo, useState } from 'react';
import { EmptyState } from '@/components/shared';
import { Switch } from '@/components/ui';
import {
  Bell,
  Home,
  Shirt,
  Ticket,
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
import type { NotificationKind } from '@/modules/messaging/types';

/**
 * One icon per real notification kind. The previous four-way union (Hostel /
 * Laundry / Event / System) could not represent most of what the database
 * actually emits — an order or a payment alert had nowhere to land.
 */
const KIND_ICON: Record<NotificationKind, React.ReactNode> = {
  booking: <Home className="h-4 w-4 text-lime" />,
  order: <ShoppingBag className="h-4 w-4 text-lime" />,
  message: <MessageCircle className="h-4 w-4 text-lime" />,
  payment: <Wallet className="h-4 w-4 text-lime" />,
  verification: <ShieldCheck className="h-4 w-4 text-lime" />,
  delivery: <Shirt className="h-4 w-4 text-lime" />,
  review: <Star className="h-4 w-4 text-lime" />,
  promotion: <Megaphone className="h-4 w-4 text-lime" />,
  system: <Info className="h-4 w-4 text-content-muted" />,
};

export default function NotificationsPage() {
  const [activeTab, setActiveTab] = useState<'inbox' | 'preferences'>('inbox');
  
  // Live: `notifications` is in the realtime publication, so a new alert
  // arrives without a refresh.
  useNotificationsRealtime();
  const { data: notifications = [], isLoading } = useNotifications({ pageSize: 50 });
  const markRead = useMarkNotificationsRead();

  // Channel preference toggle states
  const [prefs, setPrefs] = useState({
    hostelAlerts: true,
    laundryAlerts: true,
    eventAlerts: true,
    systemAlerts: false,
  });

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
      <h1 className="font-mono text-sm tracking-wide text-content-muted">
        /ME/NOTIFICATIONS
      </h1>

      {/* Header Block */}
      <div className="flex w-full flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="font-display mt-2 text-3xl font-medium text-content">
          Your <span className="text-lime">Notifications</span>
        </h2>

        {activeTab === 'inbox' && notifications.length > 0 && (
          <button
            onClick={handleMarkAllRead}
            disabled={unreadCount === 0}
            className="border-line/10 hover:bg-panel/60 bg-panel/30 flex items-center gap-2 rounded-lg border px-3 py-1.5 font-body text-xs font-medium text-content transition-colors disabled:opacity-40 disabled:hover:bg-panel/30"
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
          className={`font-body relative pb-3 text-sm font-medium transition-colors flex items-center gap-2 ${
            activeTab === 'inbox' ? 'text-content' : 'text-content-muted hover:text-content'
          }`}
        >
          Alerts Inbox
          {unreadCount > 0 && (
            <span className="bg-lime text-ink flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-bold">
              {unreadCount}
            </span>
          )}
          {activeTab === 'inbox' && <div className="bg-lime absolute bottom-0 left-0 h-0.5 w-full" />}
        </button>

        <button
          onClick={() => setActiveTab('preferences')}
          className={`font-body relative pb-3 text-sm font-medium transition-colors flex items-center gap-2 ${
            activeTab === 'preferences' ? 'text-content' : 'text-content-muted hover:text-content'
          }`}
        >
          <Settings className="h-3.5 w-3.5" />
          Preferences
          {activeTab === 'preferences' && <div className="bg-lime absolute bottom-0 left-0 h-0.5 w-full" />}
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
                      ? 'bg-panel/60 relative before:absolute before:left-0 before:top-1/4 before:h-1/2 before:w-1 before:rounded-r-md before:bg-lime' 
                      : 'bg-panel/20 opacity-70'
                  }`}
                >
                  <div className="bg-ink/5 border-line/10 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border">
                    {getIcon(notification.kind)}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <h4 className={`font-body text-sm ${notification.isUnread ? 'font-medium text-content' : 'text-content-muted'}`}>
                        {notification.title}
                      </h4>
                      <span className="font-body text-[11px] text-content-muted flex items-center gap-1 shrink-0">
                        <Clock className="h-3 w-3" /> {formatRelative(notification.createdAt)}
                      </span>
                    </div>
                    <p className="font-body text-xs text-content-muted mt-1 leading-relaxed max-w-2xl">
                      {notification.body}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )
        ) : (
          /* Preferences Panel utilizing UI switch component */
          <div className="border-line/10 bg-panel/30 rounded-xl border p-5 flex flex-col gap-6">
            <div>
              <h3 className="font-display text-base font-medium text-content">Notification Routing</h3>
              <p className="font-body text-xs text-content-muted mt-0.5">Toggle where and how you receive real-time campus module updates.</p>
              <p className="font-body text-xs text-amber-600 mt-2">
                These toggles are not saved yet — there is no preferences store behind them, so
                they reset when you leave the page.
              </p>
            </div>

            <div className="border-line/5 border-t pt-4 flex flex-col gap-5">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <label className="font-body text-sm font-medium text-content block">Hostel Allocations</label>
                  <span className="font-body text-xs text-content-muted">Alert me regarding application updates, status steps, and dynamic assignments.</span>
                </div>
                <Switch 
                  checked={prefs.hostelAlerts} 
                  onCheckedChange={(val) => setPrefs(p => ({ ...p, hostelAlerts: val }))} 
                />
              </div>

              <div className="border-line/5 border-t pt-4 flex items-center justify-between gap-4">
                <div>
                  <label className="font-body text-sm font-medium text-content block">Laundry Metrics</label>
                  <span className="font-body text-xs text-content-muted">Send pick-up reminders and status progression notifications.</span>
                </div>
                <Switch 
                  checked={prefs.laundryAlerts} 
                  onCheckedChange={(val) => setPrefs(p => ({ ...p, laundryAlerts: val }))} 
                />
              </div>

              <div className="border-line/5 border-t pt-4 flex items-center justify-between gap-4">
                <div>
                  <label className="font-body text-sm font-medium text-content block">Event Ticket Channels</label>
                  <span className="font-body text-xs text-content-muted">Deliver transactional ticketing entries and immediate security passes.</span>
                </div>
                <Switch 
                  checked={prefs.eventAlerts} 
                  onCheckedChange={(val) => setPrefs(p => ({ ...p, eventAlerts: val }))} 
                />
              </div>

              <div className="border-line/5 border-t pt-4 flex items-center justify-between gap-4">
                <div>
                  <label className="font-body text-sm font-medium text-content block">System Diagnostics</label>
                  <span className="font-body text-xs text-content-muted">Receive underlying profile data synchronization logs and maintenance alerts.</span>
                </div>
                <Switch 
                  checked={prefs.systemAlerts} 
                  onCheckedChange={(val) => setPrefs(p => ({ ...p, systemAlerts: val }))} 
                />
              </div>
            </div>
          </div>
        )}
      </section>
    </section>
  );
}