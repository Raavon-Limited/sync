/**
 * The landlord dashboard's pending list, with the buttons actually wired.
 *
 * WHY THIS FILE EXISTS AT ALL. `PendingRequestList` defaults `onAccept` and
 * `onDecline` to `acceptOrderMock`/`declineOrderMock` - a 500ms timer that
 * changes nothing and fails 8% of the time at random - and /landlord rendered
 * it with no handlers. So the Accept button on the dashboard was a mock, while
 * the identical decision on /landlord/requests (see request-decision.tsx) was
 * real. The two screens show the SAME rows from `getLandlordRequests`, so which
 * one a landlord happened to open decided whether their answer reached the
 * database.
 *
 * That is the whole reason bookings sat at `requested`: nothing else in the
 * product writes `awaiting_payment`, and without it the 24h hold never starts
 * and the student's Pay button - which only renders at `awaiting_payment` -
 * has nothing to render on.
 *
 * THE ACTIONS THROW, THE ROW DOES NOT. `acceptBookingRequest` returns
 * `{ ok: false, error }` rather than throwing; `PendingRow` rolls back its
 * optimistic removal on a THROW. The adapter below is that conversion, and it
 * throws the server's own sentence so the row can show it instead of "try
 * again" on a request that is no longer waiting on anybody.
 *
 * The reason list is a landlord's. A room is not out of stock and there is no
 * kitchen; see BOOKING_DECLINE_REASONS.
 */
'use client';

import {
  PendingRequestList,
  type PendingRequestItem,
} from '@/components/dashboard/pending-request-card';
import { BOOKING_DECLINE_REASONS } from '@/components/dashboard/order-actions';
import { acceptBookingRequest, declineBookingRequest } from '@/modules/hostels/request-actions';
import { useActionRefresh } from '@/lib/query/use-action-refresh';

export function PendingBookingRequests({ items }: { items: PendingRequestItem[] }) {
  const refresh = useActionRefresh();

  return (
    <PendingRequestList
      items={items}
      subject="request"
      reasons={BOOKING_DECLINE_REASONS}
      emptyLabel="No requests waiting on you right now."
      onAccept={async (id) => {
        const res = await acceptBookingRequest(id);
        if (!res.ok) throw new Error(res.error);
        // The row leaves this list optimistically, but the "Requests" KPI and
        // the tenants page are server-rendered and would otherwise keep the
        // old count until a reload.
        await refresh();
      }}
      onDecline={async (id) => {
        // The reason is collected and not sent: `declineBookingRequest` sets
        // 'cancelled' and there is no column to put it in. Asking for it is
        // still worth it - it is the pause before a decision with no undo -
        // but do not let the popover imply the student will be told why.
        const res = await declineBookingRequest(id);
        if (!res.ok) throw new Error(res.error);
        await refresh();
      }}
    />
  );
}
