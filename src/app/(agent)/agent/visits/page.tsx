/**
 * ROUTE: /agent/visits
 * ACCESS: the `agent` role, gated in proxy.ts and again here.
 * PURPOSE: Verification visits - where staff have sent this agent, and what
 *          they file when they get back.
 *
 * WHY THIS IS NOT THE SAME SCREEN AS /agent/requests
 *   These two used to be one list, merged and sorted by time, on the argument
 *   that an agent's afternoon does not distinguish them. That argument was
 *   wrong about the only thing that matters: a verification visit is somewhere
 *   you are ALREADY EXPECTED - the landlord has been told your name - and a
 *   viewing request is work you may choose to pick up. One is an obligation and
 *   one is an offer, and putting them in one column made "what can I take?" and
 *   "where must I be?" the same question.
 *
 * THE BRIEF IS THE POINT
 *   A visit without one is somebody standing outside a gate ringing a stranger.
 *   Whoever assigned it wrote which gate, who to ask for and what to photograph,
 *   and that text is the first thing on the card.
 */
import type { Metadata } from 'next';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createAdminClient } from '@/lib/supabase/admin';
import type { Row } from '@/lib/supabase/row';
import { requireAgent } from '../(components)/require-agent';
import { VisitList, type AgentVisit } from '../(components)/visit-list';
import { AgentIntro } from '../(components)/agent-intro';

export const metadata: Metadata = { title: 'Your visits' };

// An assignment can land at any moment, including while this page is open.
export const dynamic = 'force-dynamic';

/** verification_visits' new columns postdate the generated types. REGENERATE. */
function loose(c: unknown): SupabaseClient {
  return c as SupabaseClient;
}

const DONE = new Set(['Verified', 'Rejected']);

export default async function Page() {
  const user = await requireAgent();

  // Service role, because a visit joins a hostel, a vendor and two profiles and
  // the agent has no read on any of them. The RLS policy on verification_visits
  // is what says an agent may see their OWN rows; this query is filtered to
  // exactly that set and to nothing else.
  const admin = createAdminClient();

  const { data: visits } = await loose(admin)
    .from('verification_visits')
    .select(
      'id, hostel_id, vendor_id, storefront_id, status, scheduled_for, brief, meet_user_id, submitted_at, notes, photos, selfie_url',
    )
    .eq('ambassador_id', user.id)
    .order('scheduled_for', { ascending: true, nullsFirst: false });

  const rows = (visits ?? []) as Row[];

  const hostelIds = rows.map((v) => v.hostel_id).filter(Boolean) as string[];
  const vendorIds = rows.map((v) => v.vendor_id).filter(Boolean) as string[];
  const storeIds = rows.map((v) => v.storefront_id).filter(Boolean) as string[];
  const meetIds = rows.map((v) => v.meet_user_id).filter(Boolean) as string[];

  const [{ data: hostels }, { data: vendors }, { data: stores }, { data: people }] =
    await Promise.all([
      hostelIds.length
        ? admin.from('hostels').select('id, name, area, address').in('id', hostelIds)
        : Promise.resolve({ data: [] }),
      vendorIds.length
        ? admin
            .from('vendor_profiles')
            .select('id, business_name, area, business_address')
            .in('id', vendorIds)
        : Promise.resolve({ data: [] }),
      // The BRAND comes with the branch. "Tanke branch" on a card, with no
      // business attached, is not somewhere an agent can be told to go.
      storeIds.length
        ? admin
            .from('storefronts')
            .select('id, name, area, address, vendor_id, vendor_profiles(business_name)')
            .in('id', storeIds)
        : Promise.resolve({ data: [] }),
      meetIds.length
        ? admin.from('profiles').select('id, full_name, phone').in('id', meetIds)
        : Promise.resolve({ data: [] }),
    ]);

  const hostelById = new Map(((hostels ?? []) as Row[]).map((h) => [h.id as string, h]));
  const vendorById = new Map(((vendors ?? []) as Row[]).map((v) => [v.id as string, v]));
  const storeById = new Map(((stores ?? []) as Row[]).map((s) => [s.id as string, s]));
  const personById = new Map(((people ?? []) as Row[]).map((p) => [p.id as string, p]));

  const list: AgentVisit[] = rows.map((v) => {
    const h = v.hostel_id ? hostelById.get(v.hostel_id as string) : null;
    const b = v.vendor_id ? vendorById.get(v.vendor_id as string) : null;
    const s = v.storefront_id ? storeById.get(v.storefront_id as string) : null;
    const meet = v.meet_user_id ? personById.get(v.meet_user_id as string) : null;

    // "Mama Put - Tanke branch". The brand alone is ambiguous across branches
    // and the branch alone is meaningless, so a store visit needs both.
    const brand = (s?.vendor_profiles as { business_name?: string } | null)?.business_name;
    const storePlace = s ? [brand, s.name as string].filter(Boolean).join(' - ') : null;

    return {
      id: v.id as string,
      kind: v.hostel_id ? 'hostel' : v.storefront_id ? 'store' : 'vendor',
      place:
        (h?.name as string) ?? storePlace ?? (b?.business_name as string) ?? 'Unnamed listing',
      address:
        (h?.address as string) ??
        (s?.address as string) ??
        (b?.business_address as string) ??
        (h?.area as string) ??
        (s?.area as string) ??
        (b?.area as string) ??
        'No address on the listing',
      status: (v.status as string) ?? 'Not Visited',
      scheduledFor: (v.scheduled_for as string) ?? null,
      brief: (v.brief as string) ?? null,
      photoCount: ((v.photos as string[] | null) ?? []).length,
      hasSelfie: v.selfie_url != null,
      // The student who asked to view the room. Their phone is here because an
      // agent standing outside a locked gate needs to ring somebody, and the
      // alternative is a support message that takes an hour.
      meetName: (meet?.full_name as string) ?? null,
      meetPhone: (meet?.phone as string) ?? null,
    };
  });

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
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-content-muted font-mono text-xs tracking-wide sm:text-sm">
            YOUR VISITS
          </p>
          <h1 className="font-display text-content mt-1 text-2xl sm:text-3xl">
            Where you are <span className="text-lime-deep">expected.</span>
          </h1>
        </div>
        {/* The explanation moved behind a button. It is three sentences an agent
            reads once and then scrolls past every day for a year   on a phone
            that is most of the first screen. */}
        <AgentIntro kind="visits" />
      </div>

      <VisitList visits={list} />
    </section>
  );
}
