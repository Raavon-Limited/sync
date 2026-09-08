/**
 * Accept/decline actions for a pending order. Mocked for now   swap the
 * body of each function for a real API call once the endpoint exists, e.g.:
 *
 *   export async function acceptOrder(id: string): Promise<void> {
 *     const res = await fetch(`/api/vendor/orders/${id}/accept`, { method: 'POST' });
 *     if (!res.ok) throw new Error('Failed to accept order');
 *   }
 *
 *   export async function declineOrder(id: string, payload: DeclinePayload): Promise<void> {
 *     const res = await fetch(`/api/vendor/orders/${id}/decline`, {
 *       method: 'POST',
 *       headers: { 'Content-Type': 'application/json' },
 *       body: JSON.stringify(payload),
 *     });
 *     if (!res.ok) throw new Error('Failed to decline order');
 *   }
 *
 * Both throw on failure so the caller's optimistic-update rollback runs
 * keep that contract when wiring in the real endpoints.
 */

export interface DeclineReasonOption {
  value: string;
  label: string;
}

/**
 * THE REASONS ARE PER-ROLE, because this popover is not only a kitchen's.
 * The list below is a food vendor's, and it was the ONLY list - so a landlord
 * turning down a request for a room was offered "Out of stock" and "Kitchen too
 * busy" to explain why. Callers who are not a vendor pass their own set; see
 * BOOKING_DECLINE_REASONS.
 */
export const DECLINE_REASONS: readonly DeclineReasonOption[] = [
  { value: 'out_of_stock', label: 'Out of stock' },
  { value: 'too_busy', label: 'Kitchen too busy' },
  { value: 'closing_soon', label: 'Closing soon' },
  { value: 'other', label: 'Other' },
];

/** A landlord turning down a request for a room. */
export const BOOKING_DECLINE_REASONS: readonly DeclineReasonOption[] = [
  { value: 'room_taken', label: 'Room already taken' },
  { value: 'not_available', label: 'Not free this session' },
  { value: 'student_unverified', label: 'Student not verified' },
  { value: 'other', label: 'Other' },
];

export type DeclineReasonCode = string;

export interface DeclinePayload {
  reason: DeclineReasonCode;
  /** Required when reason is 'other', optional extra context otherwise. */
  note?: string;
}

/** Simulates network latency + an occasional failure, so the optimistic UI has something real to handle. */
function simulateRequest(failRate = 0.08): Promise<void> {
  return new Promise((resolve, reject) => {
    setTimeout(() => {
      if (Math.random() < failRate) {
        reject(new Error('Network error'));
      } else {
        resolve();
      }
    }, 500);
  });
}

export async function acceptOrderMock(id: string): Promise<void> {
  await simulateRequest();
}

export async function declineOrderMock(id: string, payload: DeclinePayload): Promise<void> {
  await simulateRequest();
}
