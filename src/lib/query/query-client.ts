/**
 * TanStack Query client factory.
 *
 * WHY A FACTORY AND NOT A MODULE SINGLETON
 * A singleton created at module scope is shared across every request on the
 * server. In the App Router that means one user's fetched data can be handed to
 * the next user's render   a cross-request data leak, not merely a caching
 * inconvenience. `createQueryClient()` is called once per browser session on the
 * client, and once per request on the server. See `query-provider.tsx`.
 *
 * DEFAULTS, AND WHY THESE ONES
 * - `staleTime: 60s`   without it, TanStack treats data as stale the instant it
 *   arrives, so every remount refetches. Most Sync screens (listings, hostels,
 *   a vendor's catalogue) tolerate a minute of staleness; the ones that do not
 *   (chat, order tracking) override it locally or use realtime.
 * - `retry` skips 4xx. Retrying a 401 or a 403 cannot succeed   RLS denied it,
 *   and it will deny it three more times. Only transient failures are retried.
 * - `refetchOnWindowFocus: false`   with a mobile-first PWA this fires on every
 *   app switch and is mostly wasted requests.
 */
import { MutationCache, QueryClient, type DefaultOptions } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';

/**
 * Thrown when a signed-out visitor triggers a write. Components that toast
 * `error.message` say something sensible while the page navigates to /login.
 */
export class SignInRequired extends Error {
  constructor() {
    super('Sign in to continue');
    this.name = 'SignInRequired';
  }
}

declare module '@tanstack/react-query' {
  interface Register {
    mutationMeta: {
      /** A mutation that must work signed out. None exist today. */
      public?: boolean;
    };
  }
}

/**
 * SIGN IN ONLY WHEN IT IS NEEDED.
 *
 * Browsing is public (see PROTECTED_PREFIXES in proxy.ts). The moment a
 * visitor tries to DO something - book a viewing, add to cart, save, message a
 * vendor, request a service, buy a ticket - they need an account. Every one of
 * those is a TanStack mutation, so the rule lives here once instead of on
 * twenty buttons: no session, no mutation, and the visitor goes to /login with
 * ?next= pointing back at the page they were on.
 *
 * getSession() reads the local session, no network round trip. It is a UX
 * gate, not a security boundary: RLS and the server actions still refuse an
 * anonymous write on their own.
 */
const mutationCache = new MutationCache({
  onMutate: async (_vars, mutation) => {
    if (mutation.options.meta?.public) return;
    const { data } = await createClient().auth.getSession();
    if (data.session) return;
    if (typeof window !== 'undefined') {
      const here = `${window.location.pathname}${window.location.search}`;
      window.location.assign(`/login?next=${encodeURIComponent(here)}`);
    }
    throw new SignInRequired();
  },
});

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
      // Authorisation and validation failures are terminal   do not hammer.
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
  return new QueryClient({ defaultOptions, mutationCache });
}
