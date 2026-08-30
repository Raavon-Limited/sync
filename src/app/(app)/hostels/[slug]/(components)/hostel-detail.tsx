/**
 * Hostel detail — gallery, amenities, rooms, and the two things a student
 * actually wants to do: ask a question, or request the room.
 *
 * ASKING COMES BEFORE BOOKING
 *   `open_hostel_conversation` is idempotent per (hostel, student), so a
 *   student can ask "is this still available?" before any booking row exists
 *   and return to the same thread later. That door did not exist until
 *   20260822160000 — the schema permitted hostel threads and nothing could
 *   create one.
 */
'use client';

import { useState } from 'react';
import Image from 'next/image';
import { notFound } from 'next/navigation';
import {
  MapPin, ShieldCheck, BedDouble, MessageCircle, Loader2, Check, Wallet,
} from 'lucide-react';
import { Button, Badge } from '@/components/ui';
import { useHostel } from '@/modules/hostels/hooks';
import { useCreateBooking } from '@/modules/hostels/hooks';
import { useOpenHostelConversation } from '@/modules/messaging/hooks';
import { openChat } from '@/lib/chat-events';
import { useSession } from '@/providers/session-provider';

const naira = (kobo?: number | null) => `₦${((kobo ?? 0) / 100).toLocaleString()}`;

const AVAILABILITY_LABEL: Record<string, { label: string; cls: string }> = {
  available: { label: 'Rooms available', cls: 'bg-emerald-500/10 text-emerald-600' },
  filling_up: { label: 'Filling up', cls: 'bg-amber-500/10 text-amber-600' },
  full: { label: 'Fully booked', cls: 'bg-rose-500/10 text-rose-600' },
  draft: { label: 'Not yet listed', cls: 'bg-ink/5 text-content-muted' },
};

export function HostelDetail({ slug }: { slug: string }) {
  const { isAuthenticated } = useSession();
  const { data: hostel, isLoading, isError } = useHostel(slug);
  const message = useOpenHostelConversation();
  const book = useCreateBooking();
  const [selectedRoom, setSelectedRoom] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (isLoading) {
    return (
      <div className="flex flex-col gap-4">
        <div className="bg-ink/5 h-64 w-full animate-pulse rounded-2xl" />
        <div className="bg-ink/5 h-6 w-1/3 animate-pulse rounded" />
        <div className="bg-ink/5 h-24 w-full animate-pulse rounded-xl" />
      </div>
    );
  }
  if (isError || !hostel) notFound();

  const availability = AVAILABILITY_LABEL[hostel.availability ?? 'draft'];
  const cover = hostel.images[0]?.url ?? null;
  // Only rooms the landlord has listed are bookable; `state` comes from the
  // hostel_room_state view, so a held room is visibly held rather than missing.
  const bookable = hostel.rooms.filter((r) => r.isListed && r.state !== 'taken');

  return (
    <div className="flex flex-col gap-8">
      <div className="border-line/10 relative h-64 overflow-hidden rounded-2xl border md:h-80">
        {cover ? (
          <Image src={cover} alt={hostel.name} fill className="object-cover" sizes="100vw" />
        ) : (
          <div className="bg-surface-deep text-content-muted flex h-full items-center justify-center text-sm">
            No photos yet
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="font-display text-section text-content">{hostel.name}</h1>
            {hostel.isVerified && (
              <Badge className="gap-1 bg-emerald-500/10 text-emerald-600">
                <ShieldCheck className="size-3" /> Verified
              </Badge>
            )}
            <Badge className={availability.cls}>{availability.label}</Badge>
          </div>
          <p className="text-content-muted flex items-center gap-1 text-sm">
            <MapPin className="size-4" />
            {hostel.address ?? hostel.area}
            {hostel.landmark ? ` · ${hostel.landmark}` : ''}
          </p>
          <p className="text-content-muted text-sm">
            {hostel.roomType} ·{' '}
            {hostel.roomsTotal != null
              ? `${hostel.roomsAvailable ?? 0} of ${hostel.roomsTotal} rooms free`
              : 'Room count not published'}
          </p>
        </div>

        <div className="border-line/10 bg-panel flex min-w-56 flex-col gap-3 rounded-2xl border p-4">
          <div>
            <p className="text-content text-2xl font-semibold">
              {naira(hostel.pricePerSessionKobo)}
            </p>
            <p className="text-content-muted text-xs">per session</p>
          </div>
          <p className="text-content-muted flex items-center gap-1 text-xs">
            <Wallet className="size-3" /> Inspection fee {naira(hostel.inspectionFeeKobo)}
          </p>

          <Button
            className="w-full gap-2"
            disabled={book.isPending || !bookable.length || !isAuthenticated}
            onClick={() => {
              setError(null);
              book.mutate(
                { hostelId: hostel.id, roomId: selectedRoom ?? undefined },
                { onError: (e) => setError(e instanceof Error ? e.message : 'Could not request') },
              );
            }}
          >
            {book.isPending ? <Loader2 className="size-4 animate-spin" /> : <BedDouble className="size-4" />}
            {book.isSuccess ? 'Requested' : 'Request this room'}
          </Button>

          {/* The pre-booking door. Deliberately available even when nothing is
              bookable — "when will a room free up?" is exactly the question a
              student has at that moment. */}
          <Button
            variant="outline"
            className="w-full gap-2"
            disabled={message.isPending || !isAuthenticated}
            onClick={() => {
              setError(null);
              message.mutate(hostel.id, {
                onSuccess: (conversationId) => openChat(conversationId),
                onError: (e) => setError(e instanceof Error ? e.message : 'Could not open chat'),
              });
            }}
          >
            {message.isPending ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <MessageCircle className="size-4" />
            )}
            Message landlord
          </Button>

          {!isAuthenticated && (
            <p className="text-content-muted text-xs">Sign in to book or message.</p>
          )}
          {error && <p className="text-coral text-xs">{error}</p>}
          {book.isSuccess && (
            <p className="flex items-center gap-1 text-xs text-emerald-600">
              <Check className="size-3" /> Request sent to the landlord.
            </p>
          )}
        </div>
      </div>

      {hostel.amenities.length > 0 && (
        <section className="flex flex-col gap-3">
          <h2 className="text-content text-lg font-semibold">Amenities</h2>
          <div className="flex flex-wrap gap-2">
            {hostel.amenities.map((a) => (
              <Badge key={a} className="bg-ink/5 text-content">
                {a}
              </Badge>
            ))}
          </div>
        </section>
      )}

      <section className="flex flex-col gap-3">
        <h2 className="text-content text-lg font-semibold">Rooms</h2>
        {hostel.rooms.length === 0 ? (
          <p className="text-content-muted text-sm">
            The landlord has not listed individual rooms yet — request the hostel and they will be
            in touch.
          </p>
        ) : (
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {hostel.rooms.map((r) => {
              const taken = r.state === 'taken';
              const held = r.state === 'held';
              return (
                <button
                  key={r.id}
                  type="button"
                  disabled={taken || !r.isListed}
                  onClick={() => setSelectedRoom(r.id)}
                  className={`border-line/10 bg-panel flex flex-col gap-1 rounded-xl border p-3 text-left transition-colors ${
                    r.id === selectedRoom ? 'border-lime-deep/40 ring-lime-deep/20 ring-2' : ''
                  } ${taken || !r.isListed ? 'cursor-not-allowed opacity-50' : 'hover:border-line/25'}`}
                >
                  <span className="text-content text-sm font-medium">{r.label}</span>
                  <span className="text-content-muted text-xs">{naira(r.priceKobo)}</span>
                  <span className="text-content-muted text-xs">
                    {!r.isListed ? 'Not listed' : taken ? 'Taken' : held ? 'On hold' : 'Free'}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
