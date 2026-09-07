/**
 * What a fleet owner can see and do about their own riders.
 *
 * THE SERVICE ROLE IS USED HERE, AND THE GUARD IS WHY IT IS SAFE
 *   rider_profiles' RLS is own-row plus staff. A fleet owner is neither, so a
 *   plain query returns their own row and nothing else   which is correct as a
 *   default and useless for a page listing your riders. Every function below
 *   therefore re-reads `logistics_companies.owner_id` against auth.uid() FIRST
 *   and refuses anything else. Same pattern, and same reasoning, as
 *   modules/admin: the check is repeated per function rather than assumed from
 *   the route, because it is the only thing standing between a signed-in rider
 *   and everybody else's row.
 *
 * WHAT IS DELIBERATELY NOT EXPOSED
 *   A rider's live coordinates, and the dropoff address of anything they are
 *   carrying. A fleet owner has a real interest in "is this job moving"; they
 *   have no interest in where a particular student lives. Status and vendor are
 *   enough to answer the first without answering the second.
 */
import 'server-only';
import { createClient as createServerClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import type { Row } from '@/lib/supabase/row';

export interface FleetRider {
  id: string;
  name: string;
  phone: string | null;
  vehicleType: string;
  plateNumber: string | null;
  verificationStatus: string;
  isOnline: boolean;
  suspended: boolean;
  delivered: number;
  active: number;
  isOwner: boolean;
}

export interface Fleet {
  id: string;
  name: string;
  verificationStatus: string;
  blocked: boolean;
  riders: FleetRider[];
}

const ACTIVE = new Set(['assigned', 'picked_up', 'delivering']);

/** The caller's own company, or null when they do not own one. */
export async function getMyFleet(): Promise<Fleet | null> {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const db = createAdminClient();

  // THE GUARD. Everything below reads other people's rows, and this is what
  // says the caller is entitled to them.
  const { data: company } = await db
    .from('logistics_companies')
    .select('id, name, verification_status, verification_blocked_at')
    .eq('owner_id', user.id)
    .is('archived_at', null)
    .maybeSingle();

  const co = company as Row | null;
  if (!co) return null;

  const { data: riderRows } = await db
    .from('rider_profiles')
    .select('id, vehicle_type, plate_number, verification_status, is_online')
    .eq('company_id', co.id)
    .is('archived_at', null);

  const riders = (riderRows ?? []) as Row[];
  const ids = riders.map((r) => r.id as string);

  if (ids.length === 0) {
    return {
      id: co.id,
      name: co.name,
      verificationStatus: co.verification_status ?? 'unverified',
      blocked: co.verification_blocked_at != null,
      riders: [],
    };
  }

  const [{ data: people }, { data: jobs }] = await Promise.all([
    db.from('profiles').select('id, full_name, phone, suspended_at').in('id', ids),
    db.from('deliveries').select('rider_id, status').in('rider_id', ids).limit(2000),
  ]);

  const byId = new Map(((people ?? []) as Row[]).map((p) => [p.id as string, p]));

  const stats = new Map<string, { delivered: number; active: number }>();
  for (const j of (jobs ?? []) as Row[]) {
    const key = j.rider_id as string;
    const s = stats.get(key) ?? { delivered: 0, active: 0 };
    if (j.status === 'delivered') s.delivered++;
    else if (ACTIVE.has(j.status)) s.active++;
    stats.set(key, s);
  }

  return {
    id: co.id,
    name: co.name,
    verificationStatus: co.verification_status ?? 'unverified',
    blocked: co.verification_blocked_at != null,
    riders: riders
      .map((r) => {
        const id = r.id as string;
        const person = byId.get(id);
        const s = stats.get(id) ?? { delivered: 0, active: 0 };
        return {
          id,
          name: (person?.full_name as string) ?? 'Unnamed rider',
          phone: (person?.phone as string) ?? null,
          vehicleType: (r.vehicle_type as string) ?? 'motorcycle',
          plateNumber: (r.plate_number as string) ?? null,
          verificationStatus: (r.verification_status as string) ?? 'unverified',
          isOnline: r.is_online === true,
          suspended: person?.suspended_at != null,
          delivered: s.delivered,
          active: s.active,
          // The owner rides for their own fleet and must not be able to release
          // themselves from it by mistake   that would leave the company with
          // no riders and the owner wondering where their jobs went.
          isOwner: id === user.id,
        };
      })
      // Owner first, then whoever is carrying something, then the rest.
      .sort((a, b) => Number(b.isOwner) - Number(a.isOwner) || b.active - a.active),
  };
}

/**
 * Find a rider by the phone number on their profile, so the caller can add them.
 *
 * BY PHONE, NOT BY BROWSING. A picker listing every unaffiliated rider on the
 * platform would hand one fleet owner a directory of every rival's riders. A
 * fleet already knows who it employs; asking for the number they signed up with
 * is how that knowledge is proved.
 */
export async function findRiderByPhone(
  phone: string,
): Promise<{ id: string; name: string } | { error: string }> {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: 'You need to be signed in.' };

  const db = createAdminClient();

  const { data: company } = await db
    .from('logistics_companies')
    .select('id')
    .eq('owner_id', user.id)
    .is('archived_at', null)
    .maybeSingle();
  if (!company) return { error: 'You do not run a fleet.' };

  const { data: person } = await db
    .from('profiles')
    .select('id, full_name, phone')
    .eq('phone', phone.trim())
    .maybeSingle();

  const p = person as Row | null;
  // Same answer for "no such account" and "not a rider": a fleet owner must not
  // be able to use this box to find out who has an account on Sync.
  if (!p) return { error: 'No rider account with that number.' };

  const { data: rp } = await db
    .from('rider_profiles')
    .select('id, company_id')
    .eq('id', p.id)
    .maybeSingle();

  const r = rp as Row | null;
  if (!r) return { error: 'No rider account with that number.' };
  if (r.company_id && r.company_id !== company.id) {
    return { error: 'That rider already rides for another fleet.' };
  }

  return { id: p.id as string, name: (p.full_name as string) ?? 'Unnamed rider' };
}
