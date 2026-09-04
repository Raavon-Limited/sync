/**
 * ROUTE: /agent/requests
 * ACCESS: the `agent` role, gated in proxy.ts and again here.
 * PURPOSE: Paid student viewings - the open board, and the ones this agent has
 *          taken.
 *
 * BOTH ON ONE SCREEN, UNLIKE VISITS
 *   The board and the claimed list are two states of the SAME thing: a viewing
 *   is on the board until you take it, and then it is yours. Separating them
 *   would mean an agent who just claimed one watches it vanish and has to go
 *   looking for it. So it moves down the page, and the page says so.
 *
 * TAKEN FIRST, BOARD SECOND
 *   Work you have committed to outranks work you might take. An agent with a
 *   viewing in forty minutes should not have to scroll past six offers to find
 *   the address.
 */
import type { Metadata } from 'next';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import type { Row } from '@/lib/supabase/row';
import { requireAgent } from '../(components)/require-agent';
import { InspectionList, type AgentInspection } from '../(components)/visit-list';
import { OpenBoard, type BoardJob } from '../(components)/open-board';
import { AgentIntro } from '../(components)/agent-intro';

export const metadata: Metadata = { title: 'Viewing requests' };

// A student can pay for a viewing at any moment, and somebody else can take it
// a second later. Never cached.
export const dynamic = 'force-dynamic';

/** The claim RPCs postdate the checked-in generated types. REGENERATE. */
function loose(c: unknown): SupabaseClient {
  return c as SupabaseClient;
}

export default async function Page() {
  const user = await requireAgent();

  const admin = createAdminClient();
  // The board is read as the AGENT, not as the service role:
  // `open_inspection_board` gates on auth.uid() and returns nothing for anyone
  // who is not a working agent, so the session client is what makes that check
  // mean something rather than being bypassed by a key.
  const session = await createClient();

  const [{ data: inspectionRows }, { data: boardRows }] = await Promise.all([
    loose(admin)
      .from('hostel_inspections')
      .select(
        // full_name and phone are the CONTACT THE STUDENT GAVE FOR THIS VISIT,
        // snapshotted on the inspection row at booking. They are not always the
        // same as the ones on their profile   somebody booking a viewing may
        // well give the number they will actually be carrying that afternoon.
        'id, hostel_id, full_name, phone, scheduled_for, status, fee_kobo, report_filed_at, report_photos, report_selfie_url, reschedule_count',
      )
      .eq('ambassador_id', user.id)
      .order('scheduled_for', { ascending: true, nullsFirst: false }),
    loose(session).rpc('open_inspection_board', { p_limit: 50 }),
  ]);

  const inspectRows = (inspectionRows ?? []) as Row[];

  const hostelIds = inspectRows.map((i) => i.hostel_id).filter(Boolean) as string[];
  const { data: hostels } = hostelIds.length
    ? await admin.from('hostels').select('id, name, area, address').in('id', hostelIds)
    : { data: [] };

  const hostelById = new Map(((hostels ?? []) as Row[]).map((h) => [h.id as string, h]));

  const inspections: AgentInspection[] = inspectRows.map((i) => {
    const h = hostelById.get(i.hostel_id as string);
    return {
      id: i.id as string,
      hostelName: (h?.name as string) ?? 'Unnamed hostel',
      address: (h?.address as string) ?? (h?.area as string) ?? 'No address on the listing',
      status: (i.status as string) ?? 'pending_payment',
      scheduledFor: (i.scheduled_for as string) ?? null,
      // The inspection's own contact, snapshotted at booking. See the select.
      studentName: (i.full_name as string) ?? null,
      studentPhone: (i.phone as string) ?? null,
      feeKobo: Number(i.fee_kobo ?? 0),
      reportFiledAt: (i.report_filed_at as string) ?? null,
      photoCount: ((i.report_photos as string[] | null) ?? []).length,
      hasSelfie: i.report_selfie_url != null,
      rescheduleCount: Number(i.reschedule_count ?? 0),
    };
  });

  const board: BoardJob[] = ((boardRows ?? []) as Row[]).map((b) => ({
    inspectionId: b.inspection_id as string,
    hostelName: (b.hostel_name as string) ?? 'Unnamed hostel',
    // Area only. The street address is unsealed on claim   see open-board.tsx.
    area: (b.area as string) ?? null,
    scheduledFor: (b.scheduled_for as string) ?? null,
    feeKobo: Number(b.fee_kobo ?? 0),
  }));

  return (
    <section className="flex flex-col gap-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-content-muted font-mono text-xs tracking-wide sm:text-sm">
            VIEWING REQUESTS
          </p>
          <h1 className="font-display text-content mt-1 text-2xl sm:text-3xl">
            Viewings you can <span className="text-lime-deep">take.</span>
          </h1>
        </div>
        <AgentIntro kind="requests" />
      </div>

      <InspectionList inspections={inspections} />

      <OpenBoard jobs={board} />
    </section>
  );
}
