/**
 * Session context — the single source of "who is signed in" on the client.
 *
 * WHY THIS EXISTS
 * Every data hook needs the caller's id (a cart belongs to a student, a
 * listing to a vendor). Threading that through props from a server component
 * down to a leaf is both tedious and fragile: one component forgets, and the
 * hook silently runs with `undefined` and stays disabled forever. This puts it
 * in one place that hooks read directly.
 *
 * SECURITY: THE CACHE MUST BE CLEARED ON AUTH CHANGE
 * This is the part that matters. React Query caches by key, not by user. On a
 * shared device — which on a campus is most devices — signing out and signing
 * in as someone else would otherwise leave the previous user's orders, wallet
 * balance and chat threads sitting in the cache, and they would render for the
 * new user before any refetch resolved. `queryClient.clear()` on SIGNED_OUT and
 * on a user switch is what prevents that. RLS protects the database; it does
 * nothing about a cache that already holds decrypted answers.
 *
 * WHY `getUser()` AND NOT `getSession()`
 * `getSession()` reads the cookie and trusts it. `getUser()` verifies with the
 * Auth server. The cookie is attacker-controllable in a way the verification
 * response is not, so anything that gates UI on identity uses `getUser()`.
 * Note this still is not an authorization boundary — the proxy and RLS are.
 * This only decides what to render.
 */
'use client';

import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { User } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/client';
import { qk } from '@/lib/query/keys';
import type { Role } from '@/modules/auth/types';

export interface SessionProfile {
  id: string;
  role: Role;
  fullName: string | null;
  phone: string | null;
  businessName: string | null;
  vendorCategory: string | null;
  verificationStatus: string;
  archivedAt: string | null;
}

export interface SessionState {
  user: User | null;
  userId: string | null;
  profile: SessionProfile | null;
  role: Role | null;
  /** True until the first `getUser()` round trip settles. */
  isLoading: boolean;
  isAuthenticated: boolean;
  /** Convenience predicates used all over the shells. */
  isVendor: boolean;
  isLandlord: boolean;
  isRider: boolean;
  isStaff: boolean;
}

const SessionContext = createContext<SessionState | null>(null);

export function SessionProvider({
  children,
  /** Optional server-rendered user, so the first paint is not a logged-out flash. */
  initialUser = null,
}: {
  children: React.ReactNode;
  initialUser?: User | null;
}) {
  const [user, setUser] = useState<User | null>(initialUser);
  const [isLoading, setIsLoading] = useState(initialUser === null);
  const queryClient = useQueryClient();
  // Tracks the previously-seen id so a SWITCH of user is detected, not just a
  // sign-out. Signing straight from one account into another fires
  // SIGNED_IN without a SIGNED_OUT in between.
  const lastUserId = useRef<string | null>(initialUser?.id ?? null);

  useEffect(() => {
    const supabase = createClient();
    let active = true;

    // Verified read, not the cookie.
    supabase.auth.getUser().then(({ data }) => {
      if (!active) return;
      setUser(data.user ?? null);
      lastUserId.current = data.user?.id ?? null;
      setIsLoading(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (!active) return;
      const nextUser = session?.user ?? null;
      const nextId = nextUser?.id ?? null;

      // Any identity change invalidates every cached answer. Clearing is
      // deliberately blunt: a targeted invalidation would need a list of every
      // user-scoped key, and forgetting one is a data leak.
      if (event === 'SIGNED_OUT' || nextId !== lastUserId.current) {
        queryClient.clear();
      }

      lastUserId.current = nextId;
      setUser(nextUser);
      setIsLoading(false);
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, [queryClient]);

  // The profile carries the server-trusted role. `user_metadata.role` is
  // editable by the user themselves and must never be used for anything but
  // cosmetics.
  const { data: profile } = useQuery({
    queryKey: qk.profile.me(),
    enabled: !!user,
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<SessionProfile | null> => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from('profiles')
        .select(
          'id, role, full_name, phone, business_name, vendor_category, verification_status, archived_at',
        )
        .eq('id', user!.id)
        .maybeSingle();
      if (error) throw error;
      if (!data) return null;
      return {
        id: data.id,
        role: data.role as Role,
        fullName: data.full_name,
        phone: data.phone,
        businessName: data.business_name,
        vendorCategory: data.vendor_category,
        verificationStatus: data.verification_status,
        archivedAt: data.archived_at,
      };
    },
  });

  const value = useMemo<SessionState>(() => {
    const role = profile?.role ?? null;
    return {
      user,
      userId: user?.id ?? null,
      profile: profile ?? null,
      role,
      isLoading,
      isAuthenticated: !!user,
      isVendor: role === 'vendor',
      isLandlord: role === 'landlord',
      isRider: role === 'rider',
      isStaff: role === 'admin' || role === 'super_admin',
    };
  }, [user, profile, isLoading]);

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

/**
 * Read the session. Safe to call anywhere under `<Providers>`; returns a
 * logged-out shape rather than throwing when the provider is absent, so a
 * component rendered in isolation (tests, storybook) does not explode.
 */
export function useSession(): SessionState {
  const ctx = useContext(SessionContext);
  if (ctx) return ctx;
  return {
    user: null,
    userId: null,
    profile: null,
    role: null,
    isLoading: false,
    isAuthenticated: false,
    isVendor: false,
    isLandlord: false,
    isRider: false,
    isStaff: false,
  };
}

/** Just the id — the common case for data hooks. */
export function useUserId(): string | null {
  return useSession().userId;
}
