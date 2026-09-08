/**
 * Notification preferences: the catalogue, and reading/writing the rows.
 *
 * ABSENCE MEANS ON, and that rule lives in the database (`wants_notification`)
 * as well as here. A row is only ever stored to say NO, so a user who has never
 * opened this screen has no rows at all and receives everything - rather than
 * every existing account starting silent the day the table shipped.
 *
 * THE CATALOGUE IS THE KIND VOCABULARY, NOT A SUBSET. `notifications.kind` has
 * a CHECK constraint with exactly these nine values, the TS union matches it,
 * and so does this list. The screen used to show four invented toggles
 * ("hostelAlerts", "laundryAlerts") that corresponded to nothing any producer
 * ever sent, so switching one off would have muted nothing even if it had
 * saved. If a tenth kind is ever added it goes in four places: the constraint,
 * the union, the icon map, and here.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database.types';
import type { Row } from '@/lib/supabase/row';
import { unwrapList } from '@/lib/query/helpers';
import type { NotificationKind } from './types';

type Client = SupabaseClient<Database>;

export interface NotificationPreference {
  kind: NotificationKind;
  inApp: boolean;
  email: boolean;
}

export interface PreferenceMeta {
  kind: NotificationKind;
  label: string;
  description: string;
  /**
   * In-app cannot be switched off. `wants_notification` ignores the stored
   * value for these, so a toggle would be a lie - it is rendered as a locked
   * row explaining why instead.
   */
  locked?: boolean;
}

/** Every kind, in the order somebody would look for them. */
export const PREFERENCE_CATALOGUE: PreferenceMeta[] = [
  {
    kind: 'payment',
    label: 'Payments and wallet',
    description:
      'Money in or out of your wallet, rent paid, escrow released, refunds, and viewings you have paid for.',
    // A debit alert is the one chance somebody has to notice a payment they did
    // not make, and a silenced account is the first thing an attacker wants.
    locked: true,
  },
  {
    kind: 'booking',
    label: 'Bookings',
    description:
      'A landlord accepting or declining your request, a hold running out, and a room being confirmed.',
  },
  {
    kind: 'message',
    label: 'Messages',
    description: 'New messages from landlords, vendors, riders and agents.',
  },
  {
    kind: 'order',
    label: 'Orders',
    description: 'Food and shop orders being accepted, prepared and completed.',
  },
  {
    kind: 'delivery',
    label: 'Deliveries',
    description: 'A rider being assigned, setting off, and arriving.',
  },
  {
    kind: 'verification',
    label: 'Verification',
    description:
      'Your student or business verification being approved or rejected, and agent visits to your listings.',
  },
  {
    kind: 'review',
    label: 'Reviews',
    description: 'Reminders to review a stay or an order, and replies to reviews you left.',
  },
  {
    kind: 'promotion',
    label: 'Offers and promotions',
    description: 'Discounts, new listings near you, and things Sync thinks you would like.',
  },
  {
    kind: 'system',
    label: 'Account and security',
    description:
      'Sign-ins, role changes, and anything Sync needs to tell you about your account itself.',
    locked: true,
  },
];

/** Rows the user has actually stored. Everything absent is on. */
export async function fetchPreferences(db: Client): Promise<NotificationPreference[]> {
  // No user filter: RLS is `auth.uid() = user_id` in both directions, so this
  // cannot return anybody else's and does not need to say so twice.
  const rows = unwrapList<Row>(
    await db.from('notification_preferences').select('kind, in_app, email'),
  );
  return rows.map((r) => ({
    kind: r.kind as NotificationKind,
    inApp: r.in_app ?? true,
    email: r.email ?? true,
  }));
}

/**
 * Store one choice.
 *
 * UPSERT, because there is no row until the first "no" - and the user may be
 * switching something back on, which still needs a row saying true rather than
 * a delete. Deleting on true would work and is deliberately not done: it makes
 * "I have looked at this and I want it" indistinguishable from "I never
 * touched it", which matters the day a default changes.
 */
export async function savePreference(
  db: Client,
  input: { userId: string; kind: NotificationKind; inApp: boolean; email: boolean },
): Promise<void> {
  const { error } = await db.from('notification_preferences').upsert(
    {
      user_id: input.userId,
      kind: input.kind,
      in_app: input.inApp,
      email: input.email,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'user_id,kind' },
  );
  if (error) throw error;
}
