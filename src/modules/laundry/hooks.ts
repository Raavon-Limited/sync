/**
 * Hooks for /laundry.
 *
 * Thin binding over `@/modules/services` with `vertical` fixed. Everything real
 * lives there.
 *
 * Typical pricing model: `per_unit` (₦300 per kg)   so laundry requests carry a
 * `quantity` and the service carries a `unitLabel`. The database enforces that
 * pairing via `services_price_matches_model`.
 */
'use client';

import * as shared from '@/modules/services/hooks';
import type { Service, ServiceRequestStatus } from '@/modules/services/types';
import type { PageParams } from '@/lib/query/helpers';

const VERTICAL = 'laundry' as const;

export function useLaundryCategories() {
  return shared.useServiceCategories(VERTICAL);
}

export function useLaundryServices(
  filters: { categoryId?: string; search?: string; vendorId?: string } & PageParams = {},
) {
  return shared.useServices(VERTICAL, filters);
}

export function useMyLaundryServices() {
  return shared.useMyServices();
}

export function useUpsertLaundryService() {
  return shared.useUpsertService(VERTICAL);
}

export function useLaundryRequests(
  filters: { status?: ServiceRequestStatus; vendorId?: string } & PageParams = {},
) {
  return shared.useServiceRequests({ vertical: VERTICAL, ...filters });
}

export { useService as useLaundryService, useServiceRequest as useLaundryRequest } from '@/modules/services/hooks';
export {
  useCreateServiceRequest as useCreateLaundryRequest,
  useQuoteServiceRequest as useQuoteLaundryRequest,
  useUpdateServiceRequestStatus as useUpdateLaundryRequestStatus,
  useArchiveService as useArchiveLaundryService,
} from '@/modules/services/hooks';

export type LaundryService = Service;
