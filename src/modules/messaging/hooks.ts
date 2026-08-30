/**
 * React Query hooks for the 'messaging' module, plus the realtime bridge.
 *
 * REALTIME AND REACT QUERY ARE NOT COMPETITORS
 * The pattern here is: React Query owns the cache, realtime only tells it when
 * something changed. `useConversationRealtime` does not put payloads into the
 * cache directly — it invalidates, and lets the normal query refetch. That is
 * slightly less efficient and considerably more correct, because a realtime
 * payload is a single row without its joins (a message arrives with no
 * attachments attached), and splicing a partial row into a fully-joined cache
 * entry is how "the attachment disappeared" bugs happen.
 *
 * The one exception is the optimistic send below, where we already have the
 * whole message locally.
 */
'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';
import { qk } from '@/lib/query/keys';
import type { PageParams } from '@/lib/query/helpers';
import { useRealtime } from '@/lib/query/use-realtime';
import { useSession } from '@/providers/session-provider';
import * as api from './queries';
import type { Message } from './types';

const db = () => createClient();

// ── Conversations ──────────────────────────────────────────────────────────

export function useConversations(opts: PageParams = {}) {
  const { userId } = useSession();
  return useQuery({
    queryKey: qk.conversations.list(opts),
    queryFn: () => api.fetchConversations(db(), userId!, opts),
    enabled: !!userId,
  });
}

export function useConversation(conversationId: string | undefined) {
  const { userId } = useSession();
  return useQuery({
    queryKey: qk.conversations.detail(conversationId ?? ''),
    queryFn: () => api.fetchConversation(db(), conversationId!, userId!),
    enabled: !!conversationId && !!userId,
  });
}

export function useOpenOrderConversation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (orderId: string) => api.openOrderConversation(db(), orderId),
    onSuccess() {
      qc.invalidateQueries({ queryKey: qk.conversations.all });
    },
  });
}

/** Pre-order counterpart of `useOpenOrderConversation`, keyed by listing. */
export function useOpenListingConversation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (listingId: string) => api.openListingConversation(db(), listingId),
    onSuccess() {
      qc.invalidateQueries({ queryKey: qk.conversations.all });
    },
  });
}

/**
 * The remaining conversation doors. Each mirrors `useOpenOrderConversation`:
 * one RPC, invalidate the conversation list, return the thread id so the caller
 * can open it. Written out rather than generated from a helper — the shared
 * version needed a type annotation that referenced the client factory
 * circularly, and four small functions are clearer than fighting that.
 */

/** Landlord, about an existing booking. */
export function useOpenBookingConversation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (bookingId: string) => api.openBookingConversation(db(), bookingId),
    onSuccess() {
      qc.invalidateQueries({ queryKey: qk.conversations.all });
    },
  });
}

/** Landlord, before booking — the hostel equivalent of the listing door. */
export function useOpenHostelConversation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (hostelId: string) => api.openHostelConversation(db(), hostelId),
    onSuccess() {
      qc.invalidateQueries({ queryKey: qk.conversations.all });
    },
  });
}

/** Vendor, about a beauty / laundry / workmanship request. */
export function useOpenServiceConversation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (requestId: string) => api.openServiceConversation(db(), requestId),
    onSuccess() {
      qc.invalidateQueries({ queryKey: qk.conversations.all });
    },
  });
}

/** Rider, about a delivery. Errors until dispatch has assigned one. */
export function useOpenDeliveryConversation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (orderId: string) => api.openDeliveryConversation(db(), orderId),
    onSuccess() {
      qc.invalidateQueries({ queryKey: qk.conversations.all });
    },
  });
}

// ── Messages ───────────────────────────────────────────────────────────────

export function useMessages(conversationId: string | undefined) {
  const { userId } = useSession();
  return useQuery({
    queryKey: qk.messages.byConversation(conversationId ?? ''),
    queryFn: () => api.fetchMessages(db(), conversationId!, userId!),
    enabled: !!conversationId && !!userId,
    // Chat must never render stale; realtime drives refetches.
    staleTime: 0,
  });
}

/**
 * Optimistic send. Chat is the one place where waiting for a round trip is
 * unacceptable — the message must appear the instant Enter is pressed.
 *
 * The temporary message carries a `pending-` id so the UI can render it dimmed,
 * and `onSettled` refetches to replace it with the real row (which is also how
 * the server-assigned timestamp and any attachment rows arrive).
 */
export function useSendMessage(conversationId: string) {
  const { userId } = useSession();
  const qc = useQueryClient();
  const key = qk.messages.byConversation(conversationId);

  return useMutation({
    /**
     * Files are uploaded to Storage FIRST, then the message row is written with
     * their paths. That order matters: a message row referencing an object that
     * failed to upload renders as a permanently broken attachment, whereas an
     * orphaned object costs a few KB and is invisible to the user. Fail toward
     * the harmless side.
     *
     * Uploads run in parallel — a voice note plus two photos should not take
     * three sequential round trips on a campus connection.
     */
    mutationFn: async (input: {
      body?: string;
      kind?: 'text' | 'image' | 'file' | 'voice';
      files?: File[];
    }) => {
      const files = input.files ?? [];

      const uploaded = files.length
        ? await Promise.all(
            files.map((file) =>
              api.uploadAttachment(db(), { userId: userId!, conversationId, file }),
            ),
          )
        : [];

      // Derive the kind from the payload when the caller did not say. A voice
      // note is an audio attachment with no body; the UI needs the distinction
      // to pick a waveform over a file chip.
      const kind =
        input.kind ??
        (uploaded.length === 0
          ? 'text'
          : uploaded[0].mimeType.startsWith('audio/')
            ? 'voice'
            : uploaded[0].mimeType.startsWith('image/')
              ? 'image'
              : 'file');

      return api.sendMessage(db(), {
        conversationId,
        senderId: userId!,
        kind,
        body: input.body,
        attachments: uploaded,
      });
    },

    async onMutate(input) {
      await qc.cancelQueries({ queryKey: key });
      const previous = qc.getQueryData<Message[]>(key);

      const optimistic: Message = {
        id: `pending-${Date.now()}`,
        conversationId,
        senderId: userId,
        isMine: true,
        kind: input.kind ?? 'text',
        body: input.body ?? null,
        isDeleted: false,
        editedAt: null,
        createdAt: new Date().toISOString(),
        attachments: [],
      };

      qc.setQueryData<Message[]>(key, (old) => [...(old ?? []), optimistic]);
      return { previous };
    },

    onError(_e, _v, context) {
      if (context?.previous) qc.setQueryData(key, context.previous);
    },

    onSettled() {
      qc.invalidateQueries({ queryKey: key });
      // The thread list shows the preview and reorders by recency.
      qc.invalidateQueries({ queryKey: qk.conversations.all });
    },
  });
}

export function useMarkConversationRead() {
  const { userId } = useSession();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (conversationId: string) =>
      api.markConversationRead(db(), conversationId, userId!),
    onSuccess() {
      qc.invalidateQueries({ queryKey: qk.conversations.all });
      qc.invalidateQueries({ queryKey: qk.unreadCounts.all });
    },
  });
}

export function useDeleteMessage(conversationId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (messageId: string) => api.deleteMessage(db(), messageId),
    onSettled() {
      qc.invalidateQueries({ queryKey: qk.messages.byConversation(conversationId) });
    },
  });
}

// ── Realtime ───────────────────────────────────────────────────────────────

/**
 * Live messages for one open thread.
 *
 * The filter matters: without it every subscriber receives every message their
 * policies allow across all threads, and each one triggers a refetch of a
 * conversation the user is not looking at.
 */
export function useConversationRealtime(conversationId: string | undefined) {
  useRealtime({
    channel: `messages:${conversationId ?? 'none'}`,
    enabled: !!conversationId,
    bindings: [
      { table: 'messages', filter: `conversation_id=eq.${conversationId}` },
      { table: 'message_attachments' },
    ],
    invalidate: [qk.messages.byConversation(conversationId ?? ''), qk.conversations.all],
  });
}

/**
 * Live notifications for the signed-in user — the bell badge. Mount once, high
 * in the tree; mounting it per page would open a socket per navigation.
 */
export function useNotificationsRealtime() {
  const { userId } = useSession();
  useRealtime({
    channel: `notifications:${userId ?? 'none'}`,
    enabled: !!userId,
    bindings: [{ table: 'notifications', event: 'INSERT', filter: `user_id=eq.${userId}` }],
    invalidate: [qk.notifications.all, qk.unreadCounts.all],
  });
}

/**
 * Live thread list. Fires when any conversation the user participates in gets a
 * new message, so the inbox reorders and the preview updates without a refetch
 * loop. Unfiltered because membership is not a column on `conversations` — RLS
 * already limits delivery to threads the caller belongs to.
 */
export function useConversationsRealtime() {
  const { userId } = useSession();
  useRealtime({
    channel: `conversations:${userId ?? 'none'}`,
    enabled: !!userId,
    bindings: [{ table: 'conversations' }],
    invalidate: [qk.conversations.all, qk.unreadCounts.all],
  });
}

// ── Notifications ──────────────────────────────────────────────────────────

export function useNotifications(opts: { unreadOnly?: boolean } & PageParams = {}) {
  return useQuery({
    queryKey: qk.notifications.list(opts),
    queryFn: () => api.fetchNotifications(db(), opts),
  });
}

export function useMarkNotificationsRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (ids?: string[]) => api.markNotificationsRead(db(), ids),
    onSuccess() {
      qc.invalidateQueries({ queryKey: qk.notifications.all });
      qc.invalidateQueries({ queryKey: qk.unreadCounts.all });
    },
  });
}

/** Badge counts for the shell. Cheap enough to poll as a realtime backstop. */
export function useUnreadCounts() {
  return useQuery({
    queryKey: qk.unreadCounts.all,
    queryFn: () => api.fetchUnreadCounts(db()),
    refetchInterval: 60_000,
  });
}

/**
 * Signed URLs for a thread's attachments, keyed by storage path.
 *
 * Separate from `useMessages` on purpose: signed URLs expire, so they have a
 * different cache lifetime from the messages themselves. Folding them into the
 * message query would mean either refetching whole threads to refresh links, or
 * serving links that have quietly gone stale.
 */
export function useAttachmentUrls(paths: string[]) {
  const key = [...paths].sort().join('|');

  return useQuery({
    queryKey: ['attachment-urls', key] as const,
    queryFn: () => api.getAttachmentUrls(db(), paths),
    enabled: paths.length > 0,
    // Links are issued for an hour; refresh well before they lapse.
    staleTime: 45 * 60_000,
    gcTime: 60 * 60_000,
  });
}
