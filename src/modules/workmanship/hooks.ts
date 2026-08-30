/**
 * Hooks for /workmanship.
 *
 * Thin binding over `@/modules/services` with `vertical` fixed. Everything real
 * lives there.
 *
 * Typical pricing model: `quote`. A tradesman cannot price a job before seeing
 * it, so a workmanship request starts with NO price, moves to `quoted` when the
 * vendor proposes one, and only then to `accepted` with `agreedKobo` set. The
 * `guard_service_request_cols` trigger freezes `agreed_kobo` once the request
 * leaves `requested`/`quoted`, so neither side can rewrite the deal afterwards.
 *
 * That is why the vendor detail page offers "Request" rather than a checkout:
 * there is no price to charge yet. There is no open job board — a request
 * names its vendor (`service_requests.vendor_id` is NOT NULL), so students
 * hire a specific pro from /workmanship/[slug] rather than posting a job for
 * anyone to bid on.
 */
'use client';

import * as shared from '@/modules/services/hooks';
import type { Service, ServiceRequestStatus } from '@/modules/services/types';
import type { PageParams } from '@/lib/query/helpers';

const VERTICAL = 'workmanship' as const;

export function useTrades() {
  return shared.useServiceCategories(VERTICAL);
}

export function useWorkmanshipServices(
  filters: { categoryId?: string; search?: string; vendorId?: string } & PageParams = {},
) {
  return shared.useServices(VERTICAL, filters);
}

export function useMyWorkmanshipServices() {
  return shared.useMyServices();
}

export function useUpsertWorkmanshipService() {
  return shared.useUpsertService(VERTICAL);
}

export function useWorkmanshipRequests(
  filters: { status?: ServiceRequestStatus; vendorId?: string } & PageParams = {},
) {
  return shared.useServiceRequests({ vertical: VERTICAL, ...filters });
}

export {
  useService as useWorkmanshipService,
  useServiceRequest as useWorkmanshipRequest,
} from '@/modules/services/hooks';
export {
  useCreateServiceRequest as useCreateWorkmanshipRequest,
  useQuoteServiceRequest as useQuoteWorkmanshipRequest,
  useUpdateServiceRequestStatus as useUpdateWorkmanshipRequestStatus,
  useArchiveService as useArchiveWorkmanshipService,
} from '@/modules/services/hooks';

export type WorkmanshipService = Service;
