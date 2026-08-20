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
    mutationFn: (input: {
      body?: string;
      kind?: 'text' | 'image' | 'file' | 'voice';
      attachments?: Parameters<typeof api.sendMessage>[1]['attachments'];
    }) =>
      api.sendMessage(db(), {
        conversationId,
        senderId: userId!,
        kind: input.kind,
        body: input.body,
        attachments: input.attachments,
      }),

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
