/**
 * The landlord's decision on a booking request.
 *
 * THIS IS THE TRANSITION NOTHING COULD MAKE. Every reference to
 * `awaiting_payment` in the codebase was a READ - a policy predicate, an
 * `if new.status = ...` in a trigger - and nothing anywhere ever wrote it. So a
 * student's request sat at `requested` forever, and the entire hold machinery
 * (the 24h timer, soft holds, lapse counting, the expiry sweep) hung off a
 * status that could not be reached. /landlord/requests said so honestly: it
 * listed requests and explained the decision lived elsewhere. It did not.
 *
 * THE DATABASE WAS ALREADY READY, which is why this is thirty lines and not a
 * migration. `20260823110000_landlord_booking_actions` added both halves:
 *   - `bookings_update_landlord` lets a landlord update bookings on their own
 *     hostels, and only those.
 *   - `guard_booking_privileged_cols` then freezes everything a landlord has no
 *     business touching - student_id, hostel_id, room_id, move_in, end_date,
 *     paid_at, payment_reference - and permits status changes only into
 *     ('interested','requested','awaiting_payment','cancelled'). `confirmed` is
 *     server-only, driven by the payment webhook.
 *
 * So a plain status update is the whole operation, and it is safe BECAUSE the
 * guard is doing the narrowing. Do not "improve" this into an RPC that sets
 * more columns; the columns it cannot set are the point.
 *
 * THREE THINGS HAPPEN ON ACCEPT, none of them here:
 *   - `bookings_sync_hold` sets `locked_at` and `reserved_until` (24h, or out to
 *     a booked viewing, capped at 72h).
 *   - `bookings_one_hold_per_room_idx` takes the room off the market - unless
 *     the student is deprioritised, whose hold is soft and blocks nothing.
 *   - `notify_booking_status` tells the student.
 * Accepting does NOT move money. Escrow is created when the student pays, which
 * is what the 24 hours are for.
 */
'use server';

import { revalidatePath } from 'next/cache';
import { userMessage } from '@/lib/errors';
import { createClient } from '@/lib/supabase/server';
import { render } from '@react-email/render';
import { emailFor } from '@/modules/admin/emails';
import { sendMail } from '@/modules/admin/mail';
import { formatKobo } from '@/lib/query/helpers';
import { canonicalOrigin } from '@/config/site';
import { BookingAcceptedEmail } from '@/emails/booking-accepted-email';

export type RequestResult = { ok: true } | { ok: false; error: string };

async function setStatus(bookingId: string, status: 'awaiting_payment' | 'cancelled') {
  const supabase = await createClient();

  // Runs as the landlord. RLS decides whether this row is theirs at all, and
  // the guard trigger decides which columns survive - so an id belonging to
  // somebody else's hostel changes nothing rather than erroring, and there is
  // no `landlord_id` check to get wrong here.
  const { data, error } = await supabase
    .from('bookings')
    .update({ status })
    // Only from a state that is still waiting on the landlord. Without this, a
    // double-click or a stale tab could re-accept a booking the student has
    // since paid for, and the status change would restart the hold clock on a
    // confirmed room.
    //
    // 'interested' IS ON THIS LIST BECAUSE THE SCREENS LIST IT. Both /landlord
    // and /landlord/requests read `getLandlordRequests`, which counts
    // 'requested' and 'interested' alike as needing a decision and puts Accept
    // and Decline on every one of them. With 'requested' alone, an enquiry's
    // buttons were rendered, pressed, and answered with "that request is no
    // longer waiting on you" - about a row the same screen had just called
    // pending. `guard_booking_privileged_cols` permits this transition; the
    // protection that matters is that neither 'awaiting_payment' nor
    // 'confirmed' is in here.
    .eq('id', bookingId)
    .in('status', ['requested', 'interested'])
    // Returning the rows is how we tell "updated" from "matched nothing" - an
    // update that RLS filters out succeeds with zero rows rather than erroring.
    .select('id');

  if (error) {
    return { ok: false as const, error: userMessage(error, 'We could not update that request.') };
  }
  if (!data?.length) {
    // RLS filtered it, or somebody got there first. Both mean the same thing to
    // a landlord looking at a stale list.
    return {
      ok: false as const,
      error: 'That request is no longer waiting on you. Refresh to see where it got to.',
    };
  }

  /*
   * EVERY LANDLORD SCREEN THAT COUNTS BOOKINGS, not just the one the button is
   * on. `/landlord` is the overview and it renders the same requests through
   * `getLandlordRequests`, so accepting from the requests page left the
   * dashboard showing a request that had already been decided until something
   * else happened to bust its cache.
   *
   * These pages are `force-dynamic`, but the router still serves a client-side
   * cached RSC payload for a route already visited in this session - which is
   * exactly the case here, since the landlord navigated from one to the other.
   */
  revalidatePath('/landlord');
  revalidatePath('/landlord/requests');
  revalidatePath('/landlord/tenants');
  return { ok: true as const };
}

/**
 * Accept: the room is held for this student for 24 hours while they pay.
 *
 * AND THIS ONE EMAILS, which almost nothing else in the product does.
 * Every other alert can wait for the next time somebody opens Sync. This one
 * starts a clock they lose the room by missing, and the in-app notification is
 * a bell inside an app they have no particular reason to open that evening. The
 * most likely way to lose a room was never being told you had been given one.
 */
export async function acceptBookingRequest(bookingId: string): Promise<RequestResult> {
  const res = await setStatus(bookingId, 'awaiting_payment');
  if (!res.ok) return res;

  // Deliberately after the status change and deliberately not awaited into the
  // result: the room IS held the moment the update lands. A mail provider
  // having a bad minute must not make the landlord think their decision failed
  // and click again.
  void sendAcceptanceEmail(bookingId);

  return res;
}

/**
 * The acceptance email.
 *
 * NEVER THROWS, and never blocks the decision. Everything here is best effort:
 * the booking is already held, the in-app notification is already written by
 * `notify_booking_status`, and a missing RESEND_API_KEY or an unreachable
 * provider must not turn a successful accept into an error the landlord sees.
 * Failures are logged, because a silent one is how nobody notices the whole
 * flow stopped mailing.
 *
 * The address comes from `auth.users` through the admin API - `profiles` has no
 * email column - which is why this is server-only. See modules/admin/emails.
 */
async function sendAcceptanceEmail(bookingId: string): Promise<void> {
  try {
    const supabase = await createClient();
    const { data } = await supabase
      .from('bookings')
      .select(
        'student_id, reserved_until, price_per_session_kobo, hostel:hostels(name, inspection_fee_kobo, price_per_session_kobo), room:hostel_rooms(label, price_per_session_kobo)',
      )
      .eq('id', bookingId)
      .maybeSingle();

    if (!data) return;

    const row = data as unknown as {
      student_id: string;
      reserved_until: string | null;
      price_per_session_kobo: number | null;
      hostel: {
        name: string;
        inspection_fee_kobo: number | null;
        price_per_session_kobo: number | null;
      } | null;
      room: { label: string | null; price_per_session_kobo: number | null } | null;
    };

    /*
     * The name comes from `booking_parties`, NOT a profiles read.
     *
     * This runs as the landlord, and `profiles_select_own` is auth.uid() = id -
     * a landlord cannot read a student profile, so a direct select here would
     * silently return null and every one of these emails would open "Hi there".
     * booking_parties is the SECURITY DEFINER view of exactly this data,
     * scoped to bookings on the caller's own hostels. See 20260911120000.
     */
    const [email, parties] = await Promise.all([
      emailFor(row.student_id),
      supabase.rpc('booking_parties', { p_booking_ids: [bookingId] }),
    ]);
    if (!email) return;

    const fullName = (parties.data?.[0]?.full_name as string | null) ?? null;

    // Same fallback chain the screens use: nothing snapshots a price onto a
    // booking, so reading the column alone would email somebody "Pay ₦0".
    const rentKobo =
      row.price_per_session_kobo ??
      row.room?.price_per_session_kobo ??
      row.hostel?.price_per_session_kobo ??
      0;

    const origin = canonicalOrigin();
    const html = await render(
      BookingAcceptedEmail({
        name: fullName?.split(' ')[0] ?? 'there',
        hostelName: row.hostel?.name ?? 'your hostel',
        roomLabel: row.room?.label ?? null,
        deadline: row.reserved_until
          ? new Date(row.reserved_until).toLocaleString('en-NG', {
              weekday: 'long',
              day: 'numeric',
              month: 'long',
              hour: 'numeric',
              minute: '2-digit',
              timeZone: 'Africa/Lagos',
            })
          : 'this time tomorrow',
        amount: formatKobo(rentKobo),
        inspectionFee: formatKobo(row.hostel?.inspection_fee_kobo ?? 0),
        payUrl: `${origin}/user/bookings`,
        inspectionUrl: `${origin}/user/bookings`,
      }),
    );

    const sent = await sendMail({
      to: email,
      subject: `Your room at ${row.hostel?.name ?? 'Sync'} is held`,
      html,
    });
    if (!sent.ok) console.error('[booking-accepted] mail failed:', sent.error);
  } catch (e) {
    console.error('[booking-accepted] mail threw:', e);
  }
}

/**
 * Decline: 'cancelled', which is a terminal state the student can see.
 *
 * Not 'expired' - that word belongs to a hold nobody acted on, and the sweep
 * owns it. A landlord saying no is a decision, and the student's own screen
 * reads the two differently.
 */
export async function declineBookingRequest(bookingId: string): Promise<RequestResult> {
  return setStatus(bookingId, 'cancelled');
}
