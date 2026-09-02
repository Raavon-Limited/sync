/**
 * Every account on the platform that has a verification state, in one list.
 *
 * WHY THIS IS A MODULE AND NOT A PAGE
 *   It was the body of /admin/verification. /admin/vendors then needed the same
 *   thing for its "All" tab, and the version it had   vendor_profiles, minus
 *   landlords   was the reason that tab could say "No vendors registered yet"
 *   on a platform whose only business was a landlord, while the overview card
 *   two clicks away counted it.
 *
 *   Two screens reading two different definitions of "every account" is how
 *   that happens. There is now one definition and it lives here; the screens
 *   differ in how they DRAW it, which is a real difference, not in what they
 *   consider to exist.
 *
 * WHERE EACH STATUS ACTUALLY LIVES
 *   Not one column. `profiles.verification_status` is the mirror of
 *   vendor_profiles, so for somebody who is both a landlord and a student it
 *   reports the business decision   which is why students read from
 *   student_profiles (20260903180000) and only organisers and creators, who
 *   can hold no business row, read from profiles.
 *
 * SERVICE ROLE, DELIBERATELY
 *   Admin review is cross-tenant. Every caller guards itself with
 *   requireStaffArea first; this module does not, and must never be reachable
 *   from anything that has not.
 */
import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createAdminClient } from '@/lib/supabase/admin';
import type { Row } from '@/lib/supabase/row';
import type { AccountRecord } from './account-types';

/**
 * student_profiles postdates the checked-in generated types. REGENERATE once
 * 20260903180000 is applied and this goes.
 */
function loose(c: unknown): SupabaseClient {
  return c as SupabaseClient;
}

export async function listAccounts(): Promise<AccountRecord[]> {
  const db = createAdminClient();

  const [
    { data: businesses },
    { data: riders },
    { data: companies },
    { data: people },
    { data: students },
    { data: organisers },
  ] = await Promise.all([
    db
      .from('vendor_profiles')
      .select(
        'id, business_name, slug, category, area, verification_status, verification_blocked_at, created_at',
      )
      .is('archived_at', null)
      .order('created_at', { ascending: false }),
    db
      .from('rider_profiles')
      .select('id, verification_status, verification_blocked_at, created_at')
      .is('archived_at', null)
      .order('created_at', { ascending: false }),
    db
      .from('logistics_companies')
      .select('id, name, owner_id, verification_status, verification_blocked_at, created_at')
      .is('archived_at', null)
      .order('created_at', { ascending: false }),
    // Names for riders (rider_profiles has none), the suspension flag, and the
    // archive flag   all three are facts about the person, not the account.
    db.from('profiles').select('id, full_name, suspended_at, archived_at'),
    loose(db)
      .from('student_profiles')
      .select('id, matric_number, department, verification_status, created_at')
      .order('created_at', { ascending: false }),
    // Event organisers and content creators. Neither can hold a business row,
    // so for them profiles.verification_status IS the authority rather than
    // the vendor mirror. Read explicitly, because they were invisible to the
    // queue until now: a submitted organiser sat pending with nothing to show
    // a reviewer.
    db
      .from('profiles')
      .select('id, full_name, role, verification_status, created_at')
      .in('role', ['event_manager', 'creator'])
      .is('archived_at', null)
      .order('created_at', { ascending: false }),
  ]);

  const person = new Map(
    ((people ?? []) as Row[]).map((p) => [
      p.id as string,
      {
        name: (p.full_name as string) ?? null,
        suspended: p.suspended_at != null,
        archived: p.archived_at != null,
      },
    ]),
  );

  const rows: AccountRecord[] = [];

  for (const b of (businesses ?? []) as Row[]) {
    const id = b.id as string;
    const isLandlord = b.category === 'landlord';
    rows.push({
      id,
      // vendor_profiles.id IS the owner's profile id.
      personId: id,
      kind: isLandlord ? 'landlord' : 'vendor',
      name: (b.business_name as string) ?? 'Unnamed business',
      detail: (b.category as string) ?? ' ',
      area: (b.area as string) ?? null,
      status: (b.verification_status as string) ?? 'unverified',
      blocked: b.verification_blocked_at != null,
      suspended: person.get(id)?.suspended ?? false,
      // A landlord is listed with every other business but decided on its own
      // page, which is the only one carrying the hostels.
      href: isLandlord
        ? `/admin/landlord/${b.slug as string}`
        : `/admin/vendors/${b.slug as string}`,
      createdAt: b.created_at as string,
    });
  }

  for (const r of (riders ?? []) as Row[]) {
    const id = r.id as string;
    rows.push({
      id,
      personId: id,
      kind: 'rider',
      name: person.get(id)?.name ?? 'Unnamed rider',
      detail: 'rider',
      status: (r.verification_status as string) ?? 'unverified',
      blocked: r.verification_blocked_at != null,
      suspended: person.get(id)?.suspended ?? false,
      href: `/admin/riders/${id}`,
      createdAt: r.created_at as string,
    });
  }

  for (const st of (students ?? []) as Row[]) {
    const id = st.id as string;
    // student_profiles has no archived_at of its own; the person carries it,
    // and an archived account is not a queue item. Every other source filters
    // this in its own query   this one cannot, so it is filtered here.
    if (person.get(id)?.archived) continue;
    rows.push({
      id,
      personId: id,
      kind: 'student',
      name: person.get(id)?.name ?? 'No name set',
      detail: (st.department as string) ?? (st.matric_number as string) ?? 'student',
      status: (st.verification_status as string) ?? 'unverified',
      // A student has no fraud block: verification_blocked_at is a
      // vendor_profiles / rider_profiles column. Suspension is the equivalent
      // lever and it lives on the person, which is read like everyone else's.
      blocked: false,
      suspended: person.get(id)?.suspended ?? false,
      href: `/admin/students/${id}`,
      createdAt: st.created_at as string,
    });
  }

  for (const o of (organisers ?? []) as Row[]) {
    const id = o.id as string;
    rows.push({
      id,
      personId: id,
      kind: 'organiser',
      name: (o.full_name as string) ?? 'No name set',
      detail: (o.role as string) === 'creator' ? 'content creator' : 'events',
      status: (o.verification_status as string) ?? 'unverified',
      // No fraud-block column for these roles   see the review component.
      blocked: false,
      suspended: person.get(id)?.suspended ?? false,
      href: `/admin/events/${id}`,
      createdAt: o.created_at as string,
    });
  }

  for (const c of (companies ?? []) as Row[]) {
    const owner = c.owner_id as string;
    rows.push({
      id: c.id as string,
      // A company is not a person. Its documents and its face are the owner's.
      personId: owner,
      kind: 'company',
      name: (c.name as string) ?? 'Unnamed company',
      detail: 'logistics',
      status: (c.verification_status as string) ?? 'unverified',
      blocked: c.verification_blocked_at != null,
      suspended: person.get(owner)?.suspended ?? false,
      href: '/admin/riders',
      createdAt: c.created_at as string,
    });
  }

  rows.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));

  return rows;
}
