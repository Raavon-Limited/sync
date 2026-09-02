/**
 * React Query hooks shared by the three service verticals.
 *
 * Each hook takes `vertical` explicitly. The per-vertical modules
 * (`src/modules/beauty/hooks.ts` and friends) wrap these with it already bound,
 * so a /beauty component never passes 'beauty' around by hand.
 */
'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';
import { qk } from '@/lib/query/keys';
import type { PageParams } from '@/lib/query/helpers';
import { useSession } from '@/providers/session-provider';
import * as api from './queries';
import type { Service, ServiceRequestStatus, Vertical } from './types';

const db = () => createClient();

// ── Catalogue ──────────────────────────────────────────────────────────────

/** Reference data   effectively static, so cache it for the session. */
export function useServiceCategories(vertical: Vertical) {
  return useQuery({
    queryKey: qk.services.categories(vertical),
    queryFn: () => api.fetchCategories(db(), vertical),
    staleTime: 60 * 60_000,
  });
}

export function useServices(
  vertical: Vertical,
  filters: { categoryId?: string; search?: string; vendorId?: string } & PageParams = {},
) {
  return useQuery({
    queryKey: qk.services.list({ vertical, ...filters }),
    queryFn: () => api.fetchServices(db(), vertical, filters),
  });
}

export function useService(id: string | undefined) {
  return useQuery({
    queryKey: qk.services.detail(id ?? ''),
    queryFn: () => api.fetchService(db(), id!),
    enabled: !!id,
  });
}

// ── Vendor catalogue ───────────────────────────────────────────────────────

export function useMyServices() {
  const { userId: vendorId } = useSession();
  return useQuery({
    queryKey: qk.services.list({ mine: true, vendorId: vendorId ?? '' }),
    queryFn: () => api.fetchMyServices(db(), vendorId!),
    enabled: !!vendorId,
  });
}

export function useUpsertService(vertical: Vertical) {
  const { userId } = useSession();
  const vendorId = userId!;
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: Partial<Service> & { name: string }) =>
      api.upsertService(db(), { ...input, vendorId, vertical }),
    onSuccess(service) {
      qc.invalidateQueries({ queryKey: qk.services.all });
      qc.setQueryData(qk.services.detail(service.id), service);
    },
  });
}

export function useArchiveService() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.archiveService(db(), id),
    onSuccess() {
      qc.invalidateQueries({ queryKey: qk.services.all });
    },
  });
}

// ── Requests ───────────────────────────────────────────────────────────────

export function useServiceRequests(
  filters: { vertical?: Vertical; status?: ServiceRequestStatus; vendorId?: string } & PageParams = {},
) {
  return useQuery({
    queryKey: qk.serviceRequests.list(filters),
    queryFn: () => api.fetchRequests(db(), filters),
  });
}

export function useServiceRequest(id: string | undefined) {
  return useQuery({
    queryKey: qk.serviceRequests.detail(id ?? ''),
    queryFn: () => api.fetchRequest(db(), id!),
    enabled: !!id,
  });
}

export function useCreateServiceRequest() {
  const { userId } = useSession();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: Omit<Parameters<typeof api.createRequest>[1], 'studentId'>) =>
      api.createRequest(db(), { ...input, studentId: userId! }),
    onSuccess(request) {
      qc.invalidateQueries({ queryKey: qk.serviceRequests.all });
      qc.setQueryData(qk.serviceRequests.detail(request.id), request);
    },
  });
}

export function useQuoteServiceRequest() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { id: string; quotedKobo: number }) =>
      api.quoteRequest(db(), input.id, input.quotedKobo),
    onSuccess(request) {
      qc.setQueryData(qk.serviceRequests.detail(request.id), request);
      qc.invalidateQueries({ queryKey: qk.serviceRequests.list() });
    },
  });
}

/**
 * Writes the new detail straight into the cache from the mutation result rather
 * than invalidating and refetching. The update already returned the full joined
 * row including its event log, so a refetch would be a second round trip for
 * data we are holding.
 */
export function useUpdateServiceRequestStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      id: string;
      status: ServiceRequestStatus;
      agreedKobo?: number;
      scheduledFor?: string;
      cancelReason?: string;
    }) =>
      api.updateRequestStatus(db(), input.id, input.status, {
        agreedKobo: input.agreedKobo,
        scheduledFor: input.scheduledFor,
        cancelReason: input.cancelReason,
      }),
    onSuccess(request) {
      qc.setQueryData(qk.serviceRequests.detail(request.id), request);
      qc.invalidateQueries({ queryKey: qk.serviceRequests.list() });
    },
  });
}

/** A service vendor by slug, for the pro detail pages. */
export function useServiceVendor(slug: string | undefined) {
  return useQuery({
    queryKey: qk.vendorProfile.detail(slug ?? ''),
    queryFn: () => api.fetchServiceVendorBySlug(db(), slug!),
    enabled: !!slug,
  });
}
