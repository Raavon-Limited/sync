/**
 * ROUTE: /agent
 * ACCESS: the `agent` role, gated in proxy.ts.
 * PURPOSE: Where an agent is expected, who they are meeting, and what they file
 *          when they get back.
 *
 * THE BRIEF IS THE POINT
 *   A visit without one is somebody standing outside a gate ringing a stranger.
 *   Whoever assigned it wrote which gate, who to ask for and what to photograph,
 *   and that text is the first thing on the card   above the address, above the
 *   date, above everything the platform knows about the listing.
 *
 * ONE LIST, ORDERED BY WHEN
 *   Not tabs. An agent's question is "where am I going next", and a screen that
 *   makes them choose a filter before it answers is a screen they read in a
 *   stairwell with one hand. Decided visits fall to the bottom rather than
 *   disappearing, because "did that one get accepted?" is the second question.
 */
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import type { Row } from '@/lib/supabase/row';
import { getCurrentUser, getProfile } from '@/modules/auth/queries';
import { VisitList, type AgentVisit, type AgentInspection } from './(components)/visit-list';
import { OpenBoard, type BoardJob } from './(components)/open-board';

export const metadata: Metadata = { title: 'Your visits' };

// An assignment can land at any moment, including while this page is open.
export const dynamic = 'force-dynamic';

/** verification_visits' new columns postdate the generated types. REGENERATE. */
function loose(c: unknown): SupabaseClient {
  return c as SupabaseClient;
}

const DONE = new Set(['Verified', 'Rejected']);

export default async function Page() {
  const [profile, user] = await Promise.all([getProfile(), getCurrentUser()]);
  if (!profile || !user) redirect('/login?next=/agent');

  // Read as a plain string: Profile['role'] is a union that predates the agent
  // role existing, and widening it here would ripple into every gate that
  // reads it. Holding the role is what counts, not currently wearing it.
  const holdsRole =
    (profile.role as string) === 'agent' || (profile.roles as string[] | null)?.includes('agent');
  if (!holdsRole) redirect('/403');

  // Service role, because a visit joins a hostel, a vendor and two profiles and
  // the agent has no read on any of them. The RLS policy on verification_visits
  // is what says an agent may see their OWN rows; this query is filtered to
  // exactly that set and to nothing else.
  const admin = createAdminClient();

  // The two errands an agent runs. Fetched together because the screen shows
  // them together   an agent's afternoon does not distinguish them.
  const { data: inspectionRows } = await loose(admin)
    .from('hostel_inspections')
    .select(
      // full_name and phone are the CONTACT THE STUDENT GAVE FOR THIS VISIT,
      // snapshotted on the inspection row at booking. They are not always the
      // same as the ones on their profile   somebody booking a viewing may well
      // give the number they will actually be carrying that afternoon   and the
      // inspection's own columns are the ones that were agreed.
      'id, hostel_id, student_id, full_name, phone, scheduled_for, status, fee_kobo, report_filed_at, reschedule_count',
    )
    .eq('ambassador_id', user.id)
    .order('scheduled_for', { ascending: true, nullsFirst: false });

  // The open board, read as the agent   `open_inspection_board` gates on
  // auth.uid() and returns nothing for anyone who is not a working agent, so
  // the session client is what makes that check mean something.
  const session = await createClient();
  const { data: boardRows } = await loose(session).rpc('open_inspection_board', { p_limit: 50 });

  const { data: visits } = await loose(admin)
    .from('verification_visits')
    .select(
      'id, hostel_id, vendor_id, status, scheduled_for, brief, meet_user_id, submitted_at, notes, photos',
    )
    .eq('ambassador_id', user.id)
    .order('scheduled_for', { ascending: true, nullsFirst: false });

  const rows = (visits ?? []) as Row[];
  const inspectRows = (inspectionRows ?? []) as Row[];

  const hostelIds = [
    ...rows.map((v) => v.hostel_id),
    ...inspectRows.map((i) => i.hostel_id),
  ].filter(Boolean) as string[];
  const vendorIds = rows.map((v) => v.vendor_id).filter(Boolean) as string[];
  // Students an agent is meeting, from either kind of errand.
  const meetIds = [
    ...rows.map((v) => v.meet_user_id),
    ...inspectRows.map((i) => i.student_id),
  ].filter(Boolean) as string[];

  const [{ data: hostels }, { data: vendors }, { data: people }] = await Promise.all([
    hostelIds.length
      ? admin.from('hostels').select('id, name, area, address').in('id', hostelIds)
      : Promise.resolve({ data: [] }),
    vendorIds.length
      ? admin
          .from('vendor_profiles')
          .select('id, business_name, area, business_address')
          .in('id', vendorIds)
      : Promise.resolve({ data: [] }),
    meetIds.length
      ? admin.from('profiles').select('id, full_name, phone').in('id', meetIds)
      : Promise.resolve({ data: [] }),
  ]);

  const hostelById = new Map(((hostels ?? []) as Row[]).map((h) => [h.id as string, h]));
  const vendorById = new Map(((vendors ?? []) as Row[]).map((v) => [v.id as string, v]));
  const personById = new Map(((people ?? []) as Row[]).map((p) => [p.id as string, p]));

  const list: AgentVisit[] = rows.map((v) => {
    const h = v.hostel_id ? hostelById.get(v.hostel_id as string) : null;
    const b = v.vendor_id ? vendorById.get(v.vendor_id as string) : null;
    const meet = v.meet_user_id ? personById.get(v.meet_user_id as string) : null;

    return {
      id: v.id as string,
      kind: v.hostel_id ? 'hostel' : 'vendor',
      place: (h?.name as string) ?? (b?.business_name as string) ?? 'Unnamed listing',
      address:
        (h?.address as string) ??
        (b?.business_address as string) ??
        (h?.area as string) ??
        (b?.area as string) ??
        'No address on the listing',
      status: (v.status as string) ?? 'Not Visited',
      scheduledFor: (v.scheduled_for as string) ?? null,
      brief: (v.brief as string) ?? null,
      photoCount: ((v.photos as string[] | null) ?? []).length,
      // The student who asked to view the room. Their phone is here because an
      // agent standing outside a locked gate needs to ring somebody, and the
      // alternative is a support message that takes an hour.
      meetName: (meet?.full_name as string) ?? null,
      meetPhone: (meet?.phone as string) ?? null,
    };
  });

  const inspections: AgentInspection[] = inspectRows.map((i) => {
    const h = hostelById.get(i.hostel_id as string);
    const student = personById.get(i.student_id as string);
    return {
      id: i.id as string,
      hostelName: (h?.name as string) ?? 'Unnamed hostel',
      address: (h?.address as string) ?? (h?.area as string) ?? 'No address on the listing',
      status: (i.status as string) ?? 'pending_payment',
      scheduledFor: (i.scheduled_for as string) ?? null,
      // THE INSPECTION'S OWN CONTACT FIRST, the profile only as a fallback.
      // This read the profile alone, so an agent rang whatever number was on
      // the account rather than the one the student gave when booking THIS
      // viewing   and `hostel_inspections.full_name` / `.phone` are NOT NULL
      // precisely because the visit needs its own.
      studentName: (i.full_name as string) ?? (student?.full_name as string) ?? null,
      // Same reason the verification card carries one: an agent at a locked
      // gate needs to ring somebody, not open a support ticket.
      studentPhone: (i.phone as string) ?? (student?.phone as string) ?? null,
      feeKobo: Number(i.fee_kobo ?? 0),
      reportFiledAt: (i.report_filed_at as string) ?? null,
      rescheduleCount: Number(i.reschedule_count ?? 0),
    };
  });

  const board: BoardJob[] = ((boardRows ?? []) as Row[]).map((b) => ({
    inspectionId: b.inspection_id as string,
    hostelName: (b.hostel_name as string) ?? 'Unnamed hostel',
    // Area only. The street address is not on the board   see open-board.tsx.
    area: (b.area as string) ?? null,
    scheduledFor: (b.scheduled_for as string) ?? null,
    feeKobo: Number(b.fee_kobo ?? 0),
  }));

  // Undecided first, then by date. Decided visits keep their place at the
  // bottom rather than vanishing   "was that one accepted?" is a real question.
  list.sort((a, b) => {
    const ad = DONE.has(a.status) ? 1 : 0;
    const bd = DONE.has(b.status) ? 1 : 0;
    if (ad !== bd) return ad - bd;
    return (a.scheduledFor ?? '9999').localeCompare(b.scheduledFor ?? '9999');
  });

  return (
    <section className="flex flex-col gap-4">
      <div>
        <p className="text-content-muted font-mono text-sm tracking-wide">YOUR VISITS</p>
        <h1 className="font-display text-content mt-1 text-3xl">
          Where you are <span className="text-lime-deep">expected.</span>
        </h1>
        <p className="text-content-muted mt-2 text-sm">
          The owner has been told you are coming. Take the photos, file what you found, and a
          reviewer decides you never decide your own visit. Paid viewings are in the same list:
          filing your report is what releases your fee.
        </p>
      </div>

      {/* The board comes FIRST. An agent opening this screen with nothing
          assigned needs work, not an empty list; one with a full afternoon
          scrolls past it. */}
      <OpenBoard jobs={board} />

      <VisitList visits={list} inspections={inspections} />
    </section>
  );
}
