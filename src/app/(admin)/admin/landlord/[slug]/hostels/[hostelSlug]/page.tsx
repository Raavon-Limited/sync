/**
 * ROUTE: /admin/landlord/[slug]/hostels/[hostelSlug]
 * ACCESS: admin / super_admin only.
 * PURPOSE: One hostel in full — rooms, bookings, and its verification visit.
 *
 * This is the screen support opens when someone asks "what is actually going on
 * with this property", so it shows the three things that answer that: what is
 * listed, who has booked, and whether anyone has been to look.
 */
import type { Metadata } from 'next';
import Link from 'next/link';
import Image from 'next/image';
import { notFound, redirect } from 'next/navigation';
import { ArrowLeft, ShieldCheck, MapPin, Calendar } from 'lucide-react';
import { Badge } from '@/components/ui';
import { getCurrentUser, getProfile } from '@/modules/auth/queries';
import { adminRoleForEmail } from '@/lib/admin-emails';
import { createAdminClient } from '@/lib/supabase/admin';

import type { Row } from '@/lib/supabase/row';

const naira = (kobo: number) => `₦${(kobo / 100).toLocaleString('en-NG')}`;

// The four states `hostel_room_state` can actually return. Inventing a fifth
// here is how a room silently renders with no badge at all.
const ROOM_STATE: Record<string, string> = {
  free: 'bg-emerald-500/10 text-emerald-600',
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
  return { title: `${hostelSlug} — Hostel` };
}

export default async function Page({
  params,
}: {
  params: Promise<{ slug: string; hostelSlug: string }>;
}) {
  const { slug, hostelSlug } = await params;
  const [user, profile] = await Promise.all([getCurrentUser(), getProfile()]);
  const role = profile?.role ?? adminRoleForEmail(user?.email);
  if (role !== 'admin' && role !== 'super_admin') redirect('/403');

  const admin = createAdminClient();

  const { data: hostel } = await admin
    .from('hostels')
    .select(
      'id, slug, name, area, address, landmark, room_type, price_per_session_kobo, inspection_fee_kobo, amenities, verified, lat, lng, hostel_images(url, position)',
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
      // A hostel can be visited more than once — rejected, then revisited. Only
      // the newest verdict is current, so this is a list-of-one, not a single.
      admin
        .from('hostel_verification_visits')
        .select('status, scheduled_for, notes, photos, video_url, decided_at, created_at')
        .eq('hostel_id', h.id)
        .order('created_at', { ascending: false })
        .limit(1),
      // One row per hostel always — the view groups by hostel and left-joins
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

      <div className="flex flex-col gap-2">
        <h1 className="font-display text-content flex flex-wrap items-center gap-2 text-3xl">
          {h.name}
          {h.verified ? (
            <Badge className="gap-1 bg-emerald-500/10 text-emerald-600">
              <ShieldCheck className="size-3" /> verified
            </Badge>
          ) : (
            <Badge className="bg-ink/5 text-content-muted">unverified</Badge>
          )}
        </h1>
        <p className="text-content-muted flex flex-wrap items-center gap-3 text-sm">
          <span className="flex items-center gap-1">
            <MapPin className="size-4" />
            {h.address ?? h.area}
            {h.landmark ? ` · ${h.landmark}` : ''}
          </span>
          <span>{h.room_type}</span>
          <span>{naira(h.price_per_session_kobo)} / session</span>
          <span>inspection {naira(h.inspection_fee_kobo)}</span>
          {h.lat && h.lng && (
            <a
              className="text-lime-deep underline underline-offset-2"
              href={`https://www.google.com/maps/search/?api=1&query=${h.lat},${h.lng}`}
              target="_blank"
              rel="noopener noreferrer"
            >
              map
            </a>
          )}
        </p>
        {(h.amenities ?? []).length > 0 && (
          <div className="flex flex-wrap gap-1">
            {(h.amenities as string[]).map((am) => (
              <Badge key={am} className="bg-ink/5 text-content-muted">
                {am}
              </Badge>
            ))}
          </div>
        )}
      </div>

      {(h.hostel_images ?? []).length > 0 && (
        <div className="flex flex-wrap gap-2">
          {(h.hostel_images as Row[]).map((img, i) => (
            <div
              key={i}
              className="border-line/10 relative size-28 overflow-hidden rounded-lg border"
            >
              <Image
                src={img.url}
                alt={`${h.name} ${i + 1}`}
                fill
                sizes="112px"
                className="object-cover"
              />
            </div>
          ))}
        </div>
      )}

      <section className="flex flex-col gap-2">
        <h2 className="text-content-muted font-mono text-sm tracking-wide">
          ROOMS · {a ? `${a.rooms_available}/${a.rooms_total} free` : (rooms?.length ?? 0)}
        </h2>
        {(rooms?.length ?? 0) === 0 ? (
          <p className="text-content-muted border-line/10 rounded-xl border border-dashed p-4 text-sm">
            No rooms listed. A hostel with no rooms cannot be booked.
          </p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {((rooms ?? []) as Row[]).map((r) => (
              <div
                key={r.room_id}
                className="border-line/10 flex flex-col gap-1 rounded-lg border px-3 py-2"
              >
                <span className="text-content flex items-center gap-2 text-sm">
                  {r.label}
                  <Badge className={ROOM_STATE[r.state] ?? ROOM_STATE.unlisted}>{r.state}</Badge>
                </span>
                <span className="text-content-muted text-xs">{naira(r.price_kobo ?? 0)}</span>
              </div>
            ))}
          </div>
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

      <section className="flex flex-col gap-2">
        <h2 className="text-content-muted font-mono text-sm tracking-wide">VERIFICATION VISIT</h2>
        {!v ? (
          <p className="text-content-muted border-line/10 rounded-xl border border-dashed p-4 text-sm">
            Nobody has been sent to this hostel.{' '}
            <Link
              href="/admin/verify-visits"
              className="text-lime-deep underline underline-offset-2"
            >
              Schedule a visit
            </Link>
          </p>
        ) : (
          <div className="border-line/10 bg-panel flex flex-col gap-2 rounded-xl border p-4">
            <p className="text-content flex items-center gap-2 text-sm">
              <Badge className="bg-ink/5 text-content-muted">{v.status}</Badge>
              {v.scheduled_for && (
                <span className="text-content-muted flex items-center gap-1 text-xs">
                  <Calendar className="size-3" />
                  {new Date(v.scheduled_for).toLocaleString('en-NG')}
                </span>
              )}
            </p>
            {v.notes && <p className="text-content-muted text-sm">{v.notes}</p>}
            {(v.photos ?? []).length > 0 && (
              <div className="flex flex-wrap gap-2">
                {(v.photos as string[]).map((src, i) => (
                  <div
                    key={i}
                    className="border-line/10 relative size-24 overflow-hidden rounded-lg border"
                  >
                    <Image
                      src={src}
                      alt={`Visit ${i + 1}`}
                      fill
                      sizes="96px"
                      className="object-cover"
                    />
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </section>
    </section>
  );
}
