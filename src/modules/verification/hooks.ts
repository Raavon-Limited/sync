'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';
import { qk } from '@/lib/query/keys';
import { useSession } from '@/providers/session-provider';
import * as api from './queries';

const db = () => createClient();

export function useMyDocuments() {
  return useQuery({
    queryKey: qk.verificationDocs.mine(),
    queryFn: () => api.fetchMyDocuments(db()),
  });
}

export function useUploadDocument() {
  const { userId } = useSession();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { docType: string; title: string; storagePath: string }) =>
      api.uploadDocument(db(), { ...input, ownerId: userId! }),
    onSuccess() {
      qc.invalidateQueries({ queryKey: qk.verificationDocs.all });
      // Uploading the last outstanding document can move the storefront to
      // 'pending', so the badge on the dashboard is stale.
      qc.invalidateQueries({ queryKey: qk.vendorProfile.mine() });
    },
  });
}

export function useReplaceDocument() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { id: string; storagePath: string }) =>
      api.replaceDocument(db(), input.id, input.storagePath),
    onSuccess() {
      qc.invalidateQueries({ queryKey: qk.verificationDocs.all });
    },
  });
}

export function useDeleteDocument() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.deleteDocument(db(), id),
    onSuccess() {
      qc.invalidateQueries({ queryKey: qk.verificationDocs.all });
    },
  });
}

// ── The ID card's address ───────────────────────────────────────────────────

/**
 * The caller's card code, for building their QR.
 *
 * Long `staleTime` because it only ever changes when the vendor deliberately
 * reissues — and short-polling a capability is a capability in more places.
 */
export function useMyVerificationCode() {
  const { userId } = useSession();
  return useQuery({
    queryKey: [...qk.vendorProfile.mine(), 'card-code', userId ?? ''] as const,
    queryFn: () => api.fetchMyVerificationCode(db()),
    enabled: !!userId,
    staleTime: 60 * 60_000,
  });
}

/** Reissue. Every previously printed card stops resolving immediately. */
export function useRotateVerificationCode() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.rotateVerificationCode(db()),
    onSuccess() {
      // The card on screen has to redraw with the new code, or the vendor
      // downloads one that no longer works.
      qc.invalidateQueries({ queryKey: qk.vendorProfile.mine() });
    },
  });
}
