'use client';

/**
 * What Sync is allowed to tell you about.
 *
 * WHAT THIS REPLACES. Four switches held in React state - hostelAlerts,
 * laundryAlerts, eventAlerts, systemAlerts - over a table that did not exist.
 * Three of those four named categories no producer has ever sent: nothing in
 * the codebase emits a "laundry alert", so switching it off would have muted
 * nothing even once it saved. The page's own header said the toggles were not
 * persisted, which was honest, and still left somebody setting a preference
 * that could not work.
 *
 * THE LIST IS THE KIND VOCABULARY. Every row here is a value in
 * `notifications.kind`'s CHECK constraint, so every toggle corresponds to
 * something that is actually sent, and the set is complete rather than a
 * sample. See PREFERENCE_CATALOGUE.
 *
 * ABSENCE MEANS ON. A user with no stored rows gets everything - the merge
 * below defaults to on rather than treating a missing row as unknown, which
 * matches `private.wants_notification` exactly. If the two ever disagree the
 * database is right.
 *
 * TWO ROWS CANNOT BE SWITCHED OFF and are rendered as locked rather than as
 * switches that do nothing. `wants_notification` ignores the stored value for
 * `payment` and `system`, so a working-looking toggle would be a lie told about
 * money and about account security specifically.
 */

import { useMemo } from 'react';
import { Lock } from 'lucide-react';
import { Card, Switch } from '@/components/ui';
import {
  useNotificationPreferences,
  useSaveNotificationPreference,
} from '@/modules/messaging/hooks';
import { PREFERENCE_CATALOGUE } from '@/modules/messaging/preferences';
import type { NotificationKind } from '@/modules/messaging/types';

export function PreferencesPanel() {
  const { data: stored = [], isLoading } = useNotificationPreferences();
  const save = useSaveNotificationPreference();

  // Catalogue joined to whatever the user has stored. Nothing is dropped for
  // want of a row, and nothing is invented for want of a catalogue entry.
  const rows = useMemo(() => {
    const byKind = new Map(stored.map((p) => [p.kind, p]));
    return PREFERENCE_CATALOGUE.map((meta) => {
      const pref = byKind.get(meta.kind);
      return {
        ...meta,
        inApp: meta.locked ? true : (pref?.inApp ?? true),
        email: pref?.email ?? true,
      };
    });
  }, [stored]);

  function set(kind: NotificationKind, next: { inApp?: boolean; email?: boolean }) {
    const current = rows.find((r) => r.kind === kind);
    if (!current) return;
    save.mutate({
      kind,
      inApp: next.inApp ?? current.inApp,
      email: next.email ?? current.email,
    });
  }

  if (isLoading) {
    return (
      <div className="flex flex-col gap-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="bg-ink/5 h-24 animate-pulse rounded-xl" />
        ))}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Column headings, and the honest state of each channel. Email is stored
          and not yet read by any sender, and saying so here is better than a
          switch that quietly does nothing for months. */}
      <div className="text-content-muted flex items-center justify-end gap-6 pr-1 font-mono text-[10px] tracking-widest uppercase">
        <span className="w-12 text-center">In app</span>
        <span className="w-12 text-center">Email</span>
      </div>

      <div className="flex flex-col gap-3">
        {rows.map((row) => (
          <Card key={row.kind} className="border-line/10 flex items-start gap-4 border p-4">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-content text-sm font-medium">{row.label}</p>
                {row.locked && (
                  <span className="text-content-muted bg-ink/5 flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px]">
                    <Lock className="size-2.5" aria-hidden="true" />
                    Always on
                  </span>
                )}
              </div>
              <p className="text-content-muted mt-1 text-xs leading-relaxed">{row.description}</p>
              {row.locked && (
                <p className="text-content-muted mt-1 text-[11px] leading-relaxed">
                  {row.kind === 'payment'
                    ? 'Alerts about money cannot be switched off in the app - they are how you would notice a payment you did not make. You can still turn the emails off.'
                    : 'Account and security alerts cannot be switched off in the app. You can still turn the emails off.'}
                </p>
              )}
            </div>

            <div className="flex shrink-0 items-center gap-6 pt-0.5">
              <span className="flex w-12 justify-center">
                <Switch
                  checked={row.inApp}
                  disabled={row.locked}
                  aria-label={`${row.label} in the app`}
                  onCheckedChange={(v) => set(row.kind, { inApp: v })}
                />
              </span>
              <span className="flex w-12 justify-center">
                <Switch
                  checked={row.email}
                  aria-label={`${row.label} by email`}
                  onCheckedChange={(v) => set(row.kind, { email: v })}
                />
              </span>
            </div>
          </Card>
        ))}
      </div>

      {/*
        SAID OUT LOUD, because the alternative is a switch that appears to work
        and changes nothing for months. In-app is live: `private.notify` asks
        `wants_notification` before every insert. Email is stored and no sender
        reads it yet - the only transactional mails Sync sends today (booking
        accepted, top-up receipt) each have their own trigger.
      */}
      <p className="text-content-muted border-line/10 rounded-xl border border-dashed p-4 text-xs leading-relaxed">
        In-app choices take effect immediately. Email choices are saved, but Sync only sends a
        handful of transactional emails today and they do not read this yet - so turning email off
        will not stop a booking confirmation or a payment receipt.
      </p>
    </div>
  );
}
