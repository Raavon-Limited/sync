/**
 * TanStack Query client factory.
 *
 * WHY A FACTORY AND NOT A MODULE SINGLETON
 * A singleton created at module scope is shared across every request on the
 * server. In the App Router that means one user's fetched data can be handed to
 * the next user's render — a cross-request data leak, not merely a caching
 * inconvenience. `createQueryClient()` is called once per browser session on the
 * client, and once per request on the server. See `query-provider.tsx`.
 *
 * DEFAULTS, AND WHY THESE ONES
 * - `staleTime: 60s` — without it, TanStack treats data as stale the instant it
 *   arrives, so every remount refetches. Most Sync screens (listings, hostels,
 *   a vendor's catalogue) tolerate a minute of staleness; the ones that do not
 *   (chat, order tracking) override it locally or use realtime.
 * - `retry` skips 4xx. Retrying a 401 or a 403 cannot succeed — RLS denied it,
 *   and it will deny it three more times. Only transient failures are retried.
 * - `refetchOnWindowFocus: false` — with a mobile-first PWA this fires on every
 *   app switch and is mostly wasted requests.
 */
import { QueryClient, type DefaultOptions } from '@tanstack/react-query';

/** Postgres/PostgREST errors carry a `status`; plain Errors do not. */
function statusOf(error: unknown): number | undefined {
  if (typeof error === 'object' && error !== null && 'status' in error) {
    const status = (error as { status?: unknown }).status;
    if (typeof status === 'number') return status;
  }
  return undefined;
}

const defaultOptions: DefaultOptions = {
  queries: {
    staleTime: 60_000,
    gcTime: 5 * 60_000,
    refetchOnWindowFocus: false,
    retry(failureCount, error) {
      const status = statusOf(error);
      // Authorisation and validation failures are terminal — do not hammer.
      if (status && status >= 400 && status < 500) return false;
      return failureCount < 2;
    },
  },
  mutations: {
    // Mutations are not idempotent. A retried checkout is a second order.
    retry: false,
  },
};

export function createQueryClient() {
  return new QueryClient({ defaultOptions });
}
