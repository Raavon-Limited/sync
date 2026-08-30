/** React Query hooks for reviews. */
'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';
import { useSession } from '@/providers/session-provider';
import * as api from './queries';
import type { ReviewSourceType, ReviewSubjectType } from './types';

const db = () => createClient();
const KEY = ['reviews'] as const;

export function useMyReviews() {
  const { userId } = useSession();
  return useQuery({
    queryKey: [...KEY, 'mine', userId ?? ''] as const,
    queryFn: () => api.fetchMyReviews(db(), userId!),
    enabled: !!userId,
  });
}

/** Completed transactions the student has not reviewed yet. */
export function usePendingReviews() {
  const { userId } = useSession();
  return useQuery({
    queryKey: [...KEY, 'pending', userId ?? ''] as const,
    queryFn: () => api.fetchPendingReviews(db(), userId!),
    enabled: !!userId,
  });
}

export function useSubmitReview() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      subjectType: ReviewSubjectType;
      subjectId: string;
      sourceType: ReviewSourceType;
      sourceId: string;
      rating: number;
      title?: string;
      body?: string;
    }) => api.submitReview(db(), input),
    onSuccess() {
      // Submitting moves an item from pending to posted, so both lists change.
      qc.invalidateQueries({ queryKey: KEY });
    },
  });
}
