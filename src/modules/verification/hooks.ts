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
