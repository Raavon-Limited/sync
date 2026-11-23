/**
 * ROUTE: /admin/landlord/[slug]/hostels/[hostelSlug]
 * ACCESS: admin / super_admin only.
 * PURPOSE: One hostel in full   rooms, bookings, and its verification visit.
 *
 * This is the screen support opens when someone asks "what is actually going on
 * with this property", so it shows the three things that answer that: what is
 * listed, who has booked, and whether anyone has been to look.
 */
import type { Metadata } from 'next';
import { HostelFacts, hostelFactsFromRow } from '@/components/shared/hostel-facts';
import { PhotoGrid } from '@/components/shared/photo-grid';
import { WalkthroughVideo } from '@/components/shared/walkthrough-video';
import { HostelDetailTabs } from './(components)/hostel-detail-tabs';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, Calendar } from 'lucide-react';
import { Badge } from '@/components/ui';
import { requireStaffArea } from '@/modules/admin/guard';
import { createAdminClient } from '@/lib/supabase/admin';

import type { Row } from '@/lib/supabase/row';

const naira = (kobo: number) => `₦${(kobo / 100).toLocaleString('en-NG')}`;

// The four states `hostel_room_state` can actually return. Inventing a fifth
// here is how a room silently renders with no badge at all.
const ROOM_STATE: Record<string, string> = {
  free: 'bg-lime/15 text-accent-fg',
  reserved: 'bg-amber-500/10 text-amber-600',
  booked: 'bg-rose-500/10 text-rose-600',
  unlisted: 'bg-ink/5 text-content-muted',
};

export async function generateMetadata({
  params,
}: {
  params: Promise<{ hostelSlug: string }>;
}): Promise<Metadata> {
  const { hostelSlug } = await params;
  return { title: `${hostelSlug}   Hostel` };
}

/** How many rooms show before the disclosure. */
const ROOMS_SHOWN = 10;

function RoomTile({ room }: { room: Row }) {
  return (
    <div className="border-line/10 flex flex-col gap-1 rounded-lg border px-3 py-2">
      <span className="text-content flex items-center gap-2 text-sm">
        {room.label as string}
        <Badge className={ROOM_STATE[room.state as string] ?? ROOM_STATE.unlisted}>
          {room.state as string}
        </Badge>
      </span>
      <span className="text-content-muted text-xs">{naira(room.price_kobo ?? 0)}</span>
    </div>
  );
}

export default async function Page({
  params,
}: {
  params: Promise<{ slug: string; hostelSlug: string }>;
}) {
  const { slug, hostelSlug } = await params;
  await requireStaffArea('landlords');

  const admin = createAdminClient();

  const { data: hostel } = await admin
    .from('hostels')
    .select(
      'id, slug, name, area, address, landmark, room_type, price_per_session_kobo, inspection_fee_kobo, amenities, house_rules, description, verified, lat, lng, hostel_images(url, position, kind)',
    )
    .eq('slug', hostelSlug)
    .maybeSingle();

  if (!hostel) notFound();
  const h = hostel as Row;

  const [{ data: rooms }, { data: bookings }, { data: visits }, { data: avail }] =
    await Promise.all([
      // `hostel_room_state` already carries the label and the price coalesced
      // against the hostel, so reading `hostel_rooms` too would be a second trip
      // for data this view has.
      admin
        .from('hostel_room_state')
        .select('room_id, label, price_kobo, state')
        .eq('hostel_id', h.id),
      admin
        .from('bookings')
        .select('id, status, move_in, end_date, created_at, paid_at')
        .eq('hostel_id', h.id)
        .order('created_at', { ascending: false }),
      // A hostel can be visited more than once   rejected, then revisited. Only
      // the newest verdict is current, so this is a list-of-one, not a single.
      admin
        .from('verification_visits')
        .select('status, scheduled_for, notes, photos, video_url, selfie_url, decided_at, created_at')
        .eq('hostel_id', h.id)
        .order('created_at', { ascending: false })
        .limit(1),
      // One row per hostel always   the view groups by hostel and left-joins
      // rooms, so a hostel with none still reports 0/0.
      admin.from('hostel_availability').select('*').eq('hostel_id', h.id).maybeSingle(),
    ]);

  const v = (((visits ?? []) as Row[])[0] ?? null) as Row | null;
  const a = avail as Row | null;

  return (
    <section className="flex flex-col gap-6">
      <Link
        href={`/admin/landlord/${slug}`}
        className="text-content-muted hover:text-content inline-flex items-center gap-2 text-sm"
      >
        <ArrowLeft className="size-4" /> Back to landlord
      </Link>

      {/*
        LISTING AND FINDINGS ARE TABS, not one long column.
        The two things a reviewer compares   the landlord’s photographs and
        the agent’s   were about two screens apart, with the rooms and the
        bookings between them, so the comparison was made from memory. Same
        mistake the verification panel had, fixed the same way so the two
        screens keep behaving alike.
      */}
      <HostelDetailTabs
        hasFindings={!!v}
        photoCount={((v?.photos as string[] | undefined) ?? []).length}
        listing={
          /* THE SAME COMPONENT the verification side modal renders, so a
             reviewer sees the same facts whichever door they came in
             through. */
          <HostelFacts
            hostel={hostelFactsFromRow(h)}
            headingClassName="font-display text-content flex flex-wrap items-center gap-2 text-2xl"
          />
        }
        findings={<AgentFindings visit={v} />}
        occupancy={
          <>


      {/* COLLAPSED BY DEFAULT once there are more than a handful.
          A hundred-room hostel rendered a hundred tiles between the listing and
          its bookings, and nobody scrolls that to reach the thing underneath.
          <details> rather than state: this is a server component, and the
          browser has done disclosure since before React existed. */}
      <section className="flex flex-col gap-2">
        <h2 className="text-content-muted font-mono text-sm tracking-wide">
          ROOMS · {a ? `${a.rooms_available}/${a.rooms_total} free` : (rooms?.length ?? 0)}
        </h2>
        {(rooms?.length ?? 0) === 0 ? (
          <p className="text-content-muted border-line/10 rounded-xl border border-dashed p-4 text-sm">
            No rooms listed. A hostel with no rooms cannot be booked.
          </p>
        ) : (
          <>
            {/* TEN, THEN THE REST ON REQUEST.
                Collapsing all of them put "is anything free" one click away;
                showing a hundred pushed the bookings below two screens of
                tiles. Ten is enough to see the pattern. */}
            <div className="flex flex-wrap gap-2">
              {((rooms ?? []) as Row[]).slice(0, ROOMS_SHOWN).map((r) => (
                <RoomTile key={r.room_id as string} room={r} />
              ))}
            </div>

            {(rooms?.length ?? 0) > ROOMS_SHOWN && (
              <details className="mt-2">
                <summary className="text-lime-deep cursor-pointer text-sm underline-offset-4 hover:underline">
                  Show the other {(rooms?.length ?? 0) - ROOMS_SHOWN}
                </summary>
                <div className="flex flex-wrap gap-2 pt-2">
                  {((rooms ?? []) as Row[]).slice(ROOMS_SHOWN).map((r) => (
                    <RoomTile key={r.room_id as string} room={r} />
                  ))}
                </div>
              </details>
            )}
          </>
        )}
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-content-muted font-mono text-sm tracking-wide">
          BOOKINGS · {bookings?.length ?? 0}
        </h2>
        {(bookings?.length ?? 0) === 0 ? (
          <p className="text-content-muted text-sm">No bookings yet.</p>
        ) : (
          <div className="border-line/10 divide-line/5 divide-y rounded-xl border">
            {((bookings ?? []) as Row[]).map((b) => (
              <div
                key={b.id}
                className="flex flex-wrap items-center justify-between gap-2 px-4 py-2"
              >
                <span className="text-content font-mono text-xs">
                  {String(b.id).slice(0, 8).toUpperCase()}
                </span>
                <Badge className="bg-ink/5 text-content-muted">{b.status}</Badge>
                <span className="text-content-muted text-xs">
                  {b.move_in ? new Date(b.move_in).toLocaleDateString('en-NG') : 'no move-in'} ·{' '}
                  {/* Paid is the only thing that means money moved. */}
                  {b.paid_at ? 'paid' : 'unpaid'}
                </span>
              </div>
            ))}
          </div>
        )}
          </section>
          </>
        }
      />
    </section>
  );
}

/**
 * What the agent found, or that nobody has been.
 *
 * SAME EVIDENCE THE DECISION SCREEN SHOWS. This block used to render the
 * photos alone, as 96px crops, with no video and no selfie   so the account
 * view and /admin/verify-visits disagreed about what "the agent found" even
 * means. PhotoGrid and the same three sections keep them saying one thing.
 */
function AgentFindings({ visit: v }: { visit: Row | null }) {
  if (!v) {
    return (
      <p className="text-content-muted border-line/10 rounded-xl border border-dashed p-4 text-sm">
        Nobody has been sent to this hostel.{' '}
        <Link href="/admin/verify-visits" className="text-lime-deep underline underline-offset-2">
          Schedule a visit
        </Link>
      </p>
    );
  }

  const photos = ((v.photos as string[] | null) ?? []).filter(Boolean);
  const selfie = (v.selfie_url as string | null) ?? null;
  const video = (v.video_url as string | null) ?? null;

  return (
    <div className="border-line/10 bg-panel flex flex-col gap-4 rounded-xl border p-4">
      <p className="text-content flex flex-wrap items-center gap-2 text-sm">
        <Badge className="bg-ink/5 text-content-muted">{v.status as string}</Badge>
        {v.scheduled_for ? (
          <span className="text-content-muted flex items-center gap-1 text-xs">
            <Calendar className="size-3" />
            {new Date(v.scheduled_for as string).toLocaleString('en-NG')}
          </span>
        ) : null}
      </p>

      {v.notes ? <p className="text-content-muted text-sm">{v.notes as string}</p> : null}

      {photos.length > 0 && (
        <section className="flex flex-col gap-1.5">
          <p className="text-content-muted font-mono text-xs tracking-wide uppercase">
            What the agent photographed · {photos.length}
          </p>
          <PhotoGrid photos={photos} label="Agent photo" />
        </section>
      )}

      {/* The one piece of evidence about the AGENT rather than the building.
          Absence is stated, because it is a thing a reviewer should weigh. */}
      <section className="flex flex-col gap-1.5">
        <p className="text-content-muted font-mono text-xs tracking-wide uppercase">
          The agent, at the property
        </p>
        {selfie ? (
          <PhotoGrid photos={[selfie]} label="The agent there" />
        ) : (
          <p className="text-content-muted text-xs">
            None. Photos of a building do not prove who took them.
          </p>
        )}
      </section>

      {video && (
        <section className="flex flex-col gap-1.5">
          <p className="text-content-muted font-mono text-xs tracking-wide uppercase">
            Walkthrough
          </p>
          <WalkthroughVideo src={video} />
        </section>
      )}
    </div>
  );
}
