/**
 * React Query hooks for the 'events' module.
 *
 * There is no `useBuyTicket`. Issuing a ticket is a money operation that must
 * happen in the same transaction as its payment   see the note at the top of
 * `./queries.ts`. It needs an RPC, and `tickets` has no client INSERT grant.
 */
'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';
import { qk } from '@/lib/query/keys';
import type { PageParams } from '@/lib/query/helpers';
import * as api from './queries';
import type { TicketStatus } from './queries';

const db = () => createClient();

export function useEvents(filters: { upcomingOnly?: boolean; search?: string } & PageParams = {}) {
  return useQuery({
    queryKey: qk.events.list(filters),
    queryFn: () => api.fetchEvents(db(), filters),
  });
}

export function useEvent(slug: string | undefined) {
  return useQuery({
    queryKey: qk.events.detail(slug ?? ''),
    queryFn: () => api.fetchEventBySlug(db(), slug!),
    enabled: !!slug,
  });
}

export function useMyTickets(filters: { status?: TicketStatus } & PageParams = {}) {
  return useQuery({
    queryKey: qk.tickets.mine(filters as Record<string, unknown>),
    queryFn: () => api.fetchMyTickets(db(), filters),
  });
}

export function useTicket(id: string | undefined) {
  return useQuery({
    queryKey: [...qk.tickets.all, 'detail', id ?? ''] as const,
    queryFn: () => api.fetchTicket(db(), id!),
    enabled: !!id,
  });
}

/**
 * The tiers an event sells. Separate from `useEvent` because the detail page
 * needs both and they change at different rates   an event's name is static,
 * its availability is not.
 */
export function useEventTiers(eventId: string | undefined) {
  return useQuery({
    queryKey: [...qk.events.all, 'tiers', eventId ?? ''] as const,
    queryFn: () => api.fetchEventTiers(db(), eventId!),
    enabled: !!eventId,
  });
}

/** Buys one tier's worth of tickets. See purchaseTickets on the reference. */
export function usePurchaseTickets() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { tierId: string; quantity: number; reference: string }) =>
      api.purchaseTickets(db(), input),
    onSuccess() {
      qc.invalidateQueries({ queryKey: qk.tickets.all });
      qc.invalidateQueries({ queryKey: qk.wallet.all });
      qc.invalidateQueries({ queryKey: qk.events.all });
    },
  });
}
