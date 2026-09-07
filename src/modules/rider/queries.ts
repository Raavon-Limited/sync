/**
 * What the rider and fleet screens read.
 *
 * THE BOARD AND THE ACTIVE JOB COME FROM RPCs, NOT FROM `deliveries`
 *   Not a detour. `deliveries_select_party` restricts that table to the student,
 *   the vendor and the ASSIGNED rider   which is exactly right, and exactly why
 *   a rider cannot select an unclaimed job from it. open_delivery_board returns
 *   a redacted row (no dropoff address) and my_active_delivery returns the full
 *   one, and the line between them is the moment a rider actually took the job.
 *   See 20260901270000 for why widening the policy instead would have been the
 *   wrong fix.
 */
import 'server-only';
import { createClient as createServerClient } from '@/lib/supabase/server';
import type { Row } from '@/lib/supabase/row';

export interface RiderProfile {
  id: string;
  vehicleType: string;
  plateNumber: string | null;
  verificationStatus: string;
  blocked: boolean;
  blockedReason: string | null;
  isOnline: boolean;
  ratingAvg: number;
  deliveriesCount: number;
  companyId: string | null;
  suspendedAt: string | null;
  suspendedReason: string | null;
}

export interface BoardJob {
  deliveryId: string;
  orderId: string;
  vendorName: string;
  pickupAddress: string | null;
  dropoffArea: string | null;
  distanceMeters: number | null;
  feeKobo: number;
  createdAt: string;
}

export interface ActiveJob {
  deliveryId: string;
  orderId: string;
  status: string;
  vendorName: string;
  vendorPhone: string | null;
  pickupAddress: string | null;
  dropoffAddress: string;
  customerName: string | null;
  customerPhone: string | null;
  distanceMeters: number | null;
  feeKobo: number;
  assignedAt: string | null;
}

export interface CompletedJob {
  deliveryId: string;
  orderId: string;
  status: string;
  feeKobo: number;
  deliveredAt: string | null;
}

/** The caller's rider row, or null when they have never onboarded as one. */
export async function getRiderProfile(): Promise<RiderProfile | null> {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data } = await supabase
    .from('rider_profiles')
    .select(
      'id, vehicle_type, plate_number, verification_status, verification_blocked_at, verification_blocked_reason, is_online, rating_avg, deliveries_count, company_id',
    )
    .eq('id', user.id)
    .maybeSingle();

  if (!data) return null;

  // Suspension is a fact about the PERSON, so it is read from profiles rather
  // than from the rider row. One person, one suspension   see 20260901270000.
  const { data: person } = await supabase
    .from('profiles')
    .select('suspended_at, suspended_reason')
    .eq('id', user.id)
    .maybeSingle();

  const p = person as Row | null;
  const r = data as Row;

  return {
    id: r.id,
    vehicleType: r.vehicle_type ?? 'motorcycle',
    plateNumber: r.plate_number ?? null,
    verificationStatus: r.verification_status ?? 'unverified',
    blocked: r.verification_blocked_at != null,
    blockedReason: r.verification_blocked_reason ?? null,
    isOnline: r.is_online === true,
    ratingAvg: Number(r.rating_avg ?? 0),
    deliveriesCount: Number(r.deliveries_count ?? 0),
    companyId: r.company_id ?? null,
    suspendedAt: p?.suspended_at ?? null,
    suspendedReason: p?.suspended_reason ?? null,
  };
}

/**
 * Unclaimed jobs this rider may take.
 *
 * Returns empty for anyone who is not a verified, unsuspended rider   the RPC
 * decides that, not this function, so the rule lives in one place and the screen
 * renders the same either way.
 */
export async function getOpenBoard(): Promise<BoardJob[]> {
  const supabase = await createServerClient();
  const { data } = await supabase.rpc('open_delivery_board', { p_limit: 50 });
  return ((data ?? []) as Row[]).map((d) => ({
    deliveryId: d.delivery_id,
    orderId: d.order_id,
    vendorName: d.vendor_name ?? 'A vendor',
    pickupAddress: d.pickup_address ?? null,
    dropoffArea: d.dropoff_area ?? null,
    distanceMeters: d.distance_meters ?? null,
    feeKobo: Number(d.fee_kobo ?? 0),
    createdAt: d.created_at,
  }));
}

/** Jobs in this rider's hands right now, with the contact details the board withholds. */
export async function getActiveJobs(): Promise<ActiveJob[]> {
  const supabase = await createServerClient();
  const { data } = await supabase.rpc('my_active_delivery');
  return ((data ?? []) as Row[]).map((d) => ({
    deliveryId: d.delivery_id,
    orderId: d.order_id,
    status: d.status,
    vendorName: d.vendor_name ?? 'A vendor',
    vendorPhone: d.vendor_phone ?? null,
    pickupAddress: d.pickup_address ?? null,
    dropoffAddress: d.dropoff_address,
    customerName: d.customer_name ?? null,
    customerPhone: d.customer_phone ?? null,
    distanceMeters: d.distance_meters ?? null,
    feeKobo: Number(d.fee_kobo ?? 0),
    assignedAt: d.assigned_at ?? null,
  }));
}

/**
 * Finished work. Read straight from `deliveries`   legitimately, because
 * deliveries_select_party admits the assigned rider, and by this point they are.
 */
export async function getCompletedJobs(limit = 20): Promise<CompletedJob[]> {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  const { data } = await supabase
    .from('deliveries')
    .select('id, order_id, status, fee_kobo, delivered_at')
    .eq('rider_id', user.id)
    .in('status', ['delivered', 'failed', 'cancelled'])
    .order('delivered_at', { ascending: false, nullsFirst: false })
    .limit(limit);

  return ((data ?? []) as Row[]).map((d) => ({
    deliveryId: d.id,
    orderId: d.order_id,
    status: d.status,
    feeKobo: Number(d.fee_kobo ?? 0),
    deliveredAt: d.delivered_at ?? null,
  }));
}
