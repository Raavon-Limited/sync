/**
 * React Query hooks for the 'events' module.
 *
 * There is no `useBuyTicket`. Issuing a ticket is a money operation that must
 * happen in the same transaction as its payment — see the note at the top of
 * `./queries.ts`. It needs an RPC, and `tickets` has no client INSERT grant.
 */
'use client';

import { useQuery } from '@tanstack/react-query';
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
    queryKey: [...qk.events.all, 'tickets', filters] as const,
    queryFn: () => api.fetchMyTickets(db(), filters),
  });
}

export function useTicket(id: string | undefined) {
  return useQuery({
    queryKey: [...qk.events.all, 'ticket', id ?? ''] as const,
    queryFn: () => api.fetchTicket(db(), id!),
    enabled: !!id,
  });
}
