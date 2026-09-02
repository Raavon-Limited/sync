/**
 * Hooks for /beauty.
 *
 * Beauty runs on the shared `services` / `service_requests` tables, so this is a
 * thin binding over `@/modules/services` with `vertical` fixed. Everything real
 * lives there   see that module before changing anything here.
 *
 * Typical pricing model: `fixed` (₦3,500 for a haircut).
 */
'use client';

import * as shared from '@/modules/services/hooks';
import type { Service, ServiceRequestStatus } from '@/modules/services/types';
import type { PageParams } from '@/lib/query/helpers';

const VERTICAL = 'beauty' as const;

export function useBeautyCategories() {
  return shared.useServiceCategories(VERTICAL);
}

export function useBeautyServices(
  filters: { categoryId?: string; search?: string; vendorId?: string } & PageParams = {},
) {
  return shared.useServices(VERTICAL, filters);
}

export function useMyBeautyServices() {
  return shared.useMyServices();
}

export function useUpsertBeautyService() {
  return shared.useUpsertService(VERTICAL);
}

export function useBeautyRequests(
  filters: { status?: ServiceRequestStatus; vendorId?: string } & PageParams = {},
) {
  return shared.useServiceRequests({ vertical: VERTICAL, ...filters });
}

export { useService as useBeautyService, useServiceRequest as useBeautyRequest } from '@/modules/services/hooks';
export {
  useCreateServiceRequest as useCreateBeautyRequest,
  useQuoteServiceRequest as useQuoteBeautyRequest,
  useUpdateServiceRequestStatus as useUpdateBeautyRequestStatus,
  useArchiveService as useArchiveBeautyService,
} from '@/modules/services/hooks';

export type BeautyService = Service;
