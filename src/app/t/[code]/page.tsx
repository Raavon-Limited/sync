/**
 * ROUTE: /t/[code]
 * ACCESS: everyone, signed in or not - and in practice only whoever the student
 *         showed the code to, because it is 128 unguessable bits that appear
 *         nowhere else. Same construction and same reasoning as /v/[slug].
 * PURPOSE: Let somebody at a gate, a porter, a parent or the school check that
 *          this person really does hold this room, for these dates.
 *
 * WHAT IT DELIBERATELY DOES NOT SAY
 *   No phone number, no email, and NOT THE RENT. The question being answered is
 *   "does this person live here", and a proof that also discloses what somebody
 *   pays is one they will decline to show - which defeats the whole thing. The
 *   receipt, which does itemise the money, is visible only to the person who
 *   paid it. `tenancy_proof` enforces this; the verify block in 20260914090000
 *   asserts it.
 *
 * THE ANSWER IS FETCHED, NEVER CACHED.
 *   `force-dynamic` and `revalidate = 0`, for the reason /v/[slug] gives: a
 *   tenancy that ends today has to read as ended today, on a code that may
 *   already be on somebody's screen. A cached page would keep vouching for
 *   somebody who has moved out, which is worse than no verification because it
 *   looks like one.
 *
 * `noindex`, because this names a person and where they sleep.
 */
import type { Metadata } from 'next';
import { BadgeCheck, CalendarRange, Home, MapPin, ShieldX } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import { SITE } from '@/config/site';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export const metadata: Metadata = {
  title: 'Tenancy check',
  robots: { index: false, follow: false },
};

const longDate = (iso?: string | null) =>
  iso
    ? new Date(iso).toLocaleDateString('en-NG', { day: 'numeric', month: 'long', year: 'numeric' })
    : null;

export default async function Page({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const supabase = await createClient();

  const { data } = await supabase.rpc('tenancy_proof', { p_code: code });
  const proof = Array.isArray(data) ? data[0] : null;

  if (!proof) {
    return (
      <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-4 p-6 text-center">
        <ShieldX className="text-coral size-10" aria-hidden="true" />
        <h1 className="font-display text-content text-2xl font-semibold">
          This code does not match a tenancy
        </h1>
        {/* Deliberately the same answer for a made-up code and a deleted one.
            Distinguishing them tells somebody guessing which half they got
            right. */}
        <p className="text-content-muted text-sm">
          It may have been mistyped, or the booking may no longer exist. Ask for the code again.
        </p>
      </main>
    );
  }

  const ends = longDate(proof.ends_on);

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col gap-6 p-6">
      <div className="text-center">
        <p className="font-display text-lime-deep text-xl font-bold tracking-tight">{SITE.name}</p>
        <p className="text-content-muted mt-0.5 text-xs">Tenancy check</p>
      </div>

      {/* The verdict is the largest thing on the page, and it is a sentence
          rather than a badge: whoever is reading this is deciding something. */}
      <div
        className={
          proof.is_current
            ? 'flex flex-col items-center gap-2 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-6 text-center'
            : 'border-line/15 bg-panel flex flex-col items-center gap-2 rounded-2xl border p-6 text-center'
        }
      >
        {proof.is_current ? (
          <BadgeCheck className="size-8 text-emerald-500" aria-hidden="true" />
        ) : (
          <ShieldX className="text-content-muted size-8" aria-hidden="true" />
        )}
        <p className="text-content text-lg font-semibold">
          {proof.is_current ? 'Current tenant' : 'Not a current tenant'}
        </p>
        <p className="text-content-muted text-sm">
          {proof.is_current
            ? `${proof.student_name} holds this room${ends ? ` until ${ends}` : ''}.`
            : `${proof.student_name}'s tenancy here ${ends ? `ended on ${ends}` : 'is not active'}.`}
        </p>
      </div>

      <dl className="border-line/15 bg-panel flex flex-col gap-4 rounded-2xl border p-5">
        <Row label="Tenant" value={proof.student_name} />
        <Row
          label="Room"
          value={[proof.hostel_name, proof.room_label].filter(Boolean).join(' · ')}
          icon={<Home className="size-3.5" />}
        />
        {(proof.address || proof.area) && (
          <Row
            label="Address"
            value={proof.address ?? proof.area}
            icon={<MapPin className="size-3.5" />}
          />
        )}
        <Row
          label="Dates"
          value={`${longDate(proof.move_in) ?? 'Not set'} — ${ends ?? 'Not set'}`}
          icon={<CalendarRange className="size-3.5" />}
        />
        {/* The landlord's consent, which is the thing being attested. */}
        {proof.accepted_at && (
          <Row
            label="Accepted by the landlord"
            value={`${proof.landlord_name ?? 'The landlord'} · ${longDate(proof.accepted_at)}`}
          />
        )}
      </dl>

      <p className="text-content-muted text-center text-[11px] leading-relaxed">
        Checked live against {SITE.name} just now. This page shows no contact details and no payment
        information.
      </p>
    </main>
  );
}

function Row({
  label,
  value,
  icon,
}: {
  label: string;
  value: string | null;
  icon?: React.ReactNode;
}) {
  if (!value) return null;
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-content-muted font-mono text-[10px] tracking-widest uppercase">
        {label}
      </dt>
      <dd className="text-content flex items-center gap-1.5 text-sm">
        {icon}
        {value}
      </dd>
    </div>
  );
}
