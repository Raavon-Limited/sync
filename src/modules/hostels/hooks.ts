/**
 * React Query hooks for the 'hostels' module.
 */
'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';
import { qk } from '@/lib/query/keys';
import type { PageParams } from '@/lib/query/helpers';
import { useSession } from '@/providers/session-provider';
import * as api from './queries';
import type { Hostel } from './types';

const db = () => createClient();

// ── Reference data ─────────────────────────────────────────────────────────

/** Areas change roughly never   cache hard rather than refetching per screen. */
export function useAreas() {
  return useQuery({
    queryKey: qk.areas.all,
    queryFn: () => api.fetchAreas(db()),
    staleTime: 60 * 60_000,
  });
}

// ── Browse ─────────────────────────────────────────────────────────────────

export function useHostels(
  filters: {
    area?: string;
    roomType?: string;
    minPriceKobo?: number;
    maxPriceKobo?: number;
    verifiedOnly?: boolean;
    search?: string;
  } & PageParams = {},
) {
  return useQuery({
    queryKey: qk.hostels.list(filters),
    queryFn: () => api.fetchHostels(db(), filters),
  });
}

export function useHostel(slug: string | undefined) {
  return useQuery({
    queryKey: qk.hostels.detail(slug ?? ''),
    queryFn: () => api.fetchHostelBySlug(db(), slug!),
    enabled: !!slug,
  });
}

/**
 * Proximity search. Disabled until coordinates exist, so the hook can be called
 * unconditionally while geolocation is still resolving   calling hooks
 * conditionally is not an option, and `enabled` is the supported way out.
 */
export function useHostelsNear(coords: { lat: number; lng: number } | null, radiusM = 2000) {
  return useQuery({
    queryKey: qk.hostels.near(coords?.lat ?? 0, coords?.lng ?? 0, radiusM),
    queryFn: () => api.fetchHostelsNear(db(), coords!.lat, coords!.lng, radiusM),
    enabled: !!coords,
  });
}

// ── Bookings ───────────────────────────────────────────────────────────────

export function useMyBookings(opts: { status?: string } & PageParams = {}) {
  return useQuery({
    queryKey: qk.bookings.list(opts),
    queryFn: () => api.fetchMyBookings(db(), opts),
  });
}

export function useBooking(id: string | undefined) {
  return useQuery({
    queryKey: qk.bookings.detail(id ?? ''),
    queryFn: () => api.fetchBooking(db(), id!),
    enabled: !!id,
    // A hold expires on a timestamp, so this must not sit stale on screen.
    refetchInterval: 30_000,
  });
}

/**
 * Not optimistic. Creating a booking takes a HOLD on a room, and
 * `bookings_one_hold_per_room_idx` may reject it because another student got
 * there first. Showing the booking as made and then retracting it is worse than
 * a moment's spinner.
 */
export function useCreateBooking() {
  const { userId } = useSession();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { hostelId: string; roomId?: string; moveIn?: string; endDate?: string }) =>
      api.createBooking(db(), { ...input, studentId: userId! }),
    onSuccess(booking) {
      qc.invalidateQueries({ queryKey: qk.bookings.all });
      // Availability on the detail page just changed.
      qc.invalidateQueries({ queryKey: qk.hostels.all });
      qc.setQueryData(qk.bookings.detail(booking.id), booking);
    },
  });
}

export function useCancelBooking() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.cancelBooking(db(), id),
    onSuccess(booking) {
      qc.setQueryData(qk.bookings.detail(booking.id), booking);
      qc.invalidateQueries({ queryKey: qk.bookings.list() });
      qc.invalidateQueries({ queryKey: qk.hostels.all });
    },
  });
}

// ── Inspections ────────────────────────────────────────────────────────────

export function useMyInspections() {
  return useQuery({
    queryKey: [...qk.bookings.all, 'inspections'] as const,
    queryFn: () => api.fetchMyInspections(db()),
  });
}

export function useScheduleInspection() {
  const { userId } = useSession();
  const qc = useQueryClient();
  return useMutation({
    // fullName/phone/feeKobo are required by the table   the ambassador needs a
    // contact, and the fee is snapshotted so a later price change cannot
    // retroactively reprice a booked visit.
    mutationFn: (input: {
      hostelId: string;
      scheduledFor: string;
      fullName: string;
      phone: string;
      feeKobo: number;
      bookingId?: string;
    }) => api.scheduleInspection(db(), { ...input, studentId: userId! }),
    onSuccess() {
      qc.invalidateQueries({ queryKey: [...qk.bookings.all, 'inspections'] });
      // Scheduling an inspection also extends the booking hold (0006's
      // inspections_sync_hold trigger), so the booking is stale now.
      qc.invalidateQueries({ queryKey: qk.bookings.all });
    },
  });
}

// ── Landlord side ──────────────────────────────────────────────────────────

export function useMyHostels() {
  const { userId: landlordId } = useSession();
  return useQuery({
    queryKey: [...qk.hostels.all, 'mine', landlordId ?? ''] as const,
    queryFn: () => api.fetchMyHostels(db(), landlordId!),
    enabled: !!landlordId,
  });
}

export function useUpsertHostel() {
  const { userId } = useSession();
  const landlordId = userId!;
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (
      input: Partial<Hostel> & {
        name: string;
        slug: string;
        area: string;
        roomType: Hostel['roomType'];
        pricePerSessionKobo: number;
      },
    ) => api.upsertHostel(db(), { ...input, landlordId }),
    onSuccess(hostel) {
      qc.invalidateQueries({ queryKey: [...qk.hostels.all, 'mine', landlordId] });
      qc.setQueryData(qk.hostels.detail(hostel.slug), hostel);
    },
  });
}

export function useArchiveHostel() {
  const { userId } = useSession();
  const landlordId = userId!;
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.archiveHostel(db(), id),
    onSuccess() {
      qc.invalidateQueries({ queryKey: [...qk.hostels.all, 'mine', landlordId] });
    },
  });
}
