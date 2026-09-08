/**
 * React Query hooks for the 'documents' module.
 *
 * Documents are derived, not stored, so there is nothing to mutate here - only
 * two reads and the mail action, which is a server action rather than a hook
 * because it needs the address, and `profiles` has no email column.
 */
'use client';

import { useQuery } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';
import { useSession } from '@/providers/session-provider';
import * as api from './queries';

const db = () => createClient();

/** Namespaced under the wallet: a receipt is stale for exactly the reasons a
 *  balance is, so paying something invalidates both together. */
const key = (scope: string, me: string) => ['wallet', 'documents', scope, me] as const;

export function useMyDocuments() {
  const { userId } = useSession();
  return useQuery({
    queryKey: key('mine', userId ?? ''),
    queryFn: () => api.fetchMyDocuments(db(), userId!),
    enabled: !!userId,
  });
}

export function useLandlordDocuments() {
  const { userId } = useSession();
  return useQuery({
    queryKey: key('landlord', userId ?? ''),
    queryFn: () => api.fetchLandlordDocuments(db(), userId!),
    enabled: !!userId,
  });
}
