/**
 * Data access for the 'messaging' module — conversations, messages,
 * attachments and notifications.
 *
 * Backs /vendor/inbox (chat-window, chat-component, voice-recorder) and the
 * notification bell.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database.types';
import { unwrap, unwrapList, unwrapMaybe, toRange, type PageParams } from '@/lib/query/helpers';
import type { Conversation, Message, Notification, UnreadCounts } from './types';

/* eslint-disable @typescript-eslint/no-explicit-any -- see lib/query/helpers.ts */
type Row = any;
type Client = SupabaseClient<Database>;

// ── Mappers ────────────────────────────────────────────────────────────────

const toConversation = (r: Row, selfId?: string): Conversation => {
  // A direct thread's title is "the other person", which only the client can
  // resolve because it depends on who is asking.
  const others = (r.conversation_participants ?? []).filter((p: Row) => p.user_id !== selfId);
  const counterpart = others[0]?.profile;

  return {
    id: r.id,
    kind: r.kind,
    subjectType: r.subject_type,
    subjectId: r.subject_id,
    title: counterpart?.full_name ?? counterpart?.business_name ?? 'Conversation',
    avatarUrl: counterpart?.logo_url ?? null,
    counterpartId: others[0]?.user_id ?? null,
    lastMessageAt: r.last_message_at,
    lastMessagePreview: r.last_message_preview,
    // Derived, never stored — a stored counter drifts across devices.
    unreadCount: r.unread_count ?? 0,
  };
};

const toMessage = (r: Row, selfId?: string): Message => ({
  id: r.id,
  conversationId: r.conversation_id,
  senderId: r.sender_id,
  isMine: !!selfId && r.sender_id === selfId,
  kind: r.kind,
  body: r.deleted_at ? null : r.body,
  isDeleted: !!r.deleted_at,
  editedAt: r.edited_at,
  createdAt: r.created_at,
  attachments: (r.message_attachments ?? []).map((a: Row) => ({
    id: a.id,
    storagePath: a.storage_path,
    fileName: a.file_name,
    mimeType: a.mime_type,
    sizeBytes: a.size_bytes ? Number(a.size_bytes) : null,
    durationMs: a.duration_ms,
    width: a.width,
    height: a.height,
  })),
});

const toNotification = (r: Row): Notification => ({
  id: r.id,
  kind: r.kind,
  title: r.title,
  body: r.body,
  href: r.href,
  action: r.action,
  entityType: r.entity_type,
  entityId: r.entity_id,
  isUnread: !r.read_at,
  createdAt: r.created_at,
});

// ── Conversations ──────────────────────────────────────────────────────────

export async function fetchConversations(
  db: Client,
  selfId: string,
  opts: PageParams = {},
): Promise<Conversation[]> {
  const [from, to] = toRange(opts);
  const rows = unwrapList<Row>(
    await db
      .from('conversations')
      .select(
        `id, kind, subject_type, subject_id, last_message_at, last_message_preview,
         conversation_participants(user_id, last_read_at,
           profile:profiles(full_name),
           storefront:vendor_profiles(business_name, logo_url))`,
      )
      .is('archived_at', null)
      // Ordering by the denormalised column is why it exists — sorting by a
      // joined aggregate is unusable once a vendor has a few hundred threads.
      .order('last_message_at', { ascending: false })
      .range(from, to),
  );

  return rows.map((r) => toConversation(r, selfId));
}

export async function fetchConversation(
  db: Client,
  conversationId: string,
  selfId: string,
): Promise<Conversation | null> {
  const row = unwrapMaybe<Row>(
    await db
      .from('conversations')
      .select(
        `id, kind, subject_type, subject_id, last_message_at, last_message_preview,
         conversation_participants(user_id, last_read_at,
           profile:profiles(full_name),
           storefront:vendor_profiles(business_name, logo_url))`,
      )
      .eq('id', conversationId)
      .maybeSingle(),
  );
  return row ? toConversation(row, selfId) : null;
}

/** Idempotent — the RPC returns the existing thread if there is one. */
export async function openOrderConversation(db: Client, orderId: string): Promise<string> {
  const { data, error } = await db.rpc('open_order_conversation', { p_order_id: orderId });
  if (error) throw error;
  return data as string;
}

// ── Messages ───────────────────────────────────────────────────────────────

export async function fetchMessages(
  db: Client,
  conversationId: string,
  selfId: string,
  opts: PageParams = { pageSize: 50 },
): Promise<Message[]> {
  const [from, to] = toRange(opts);
  const rows = unwrapList<Row>(
    await db
      .from('messages')
      .select('*, message_attachments(*)')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: false })
      .range(from, to),
  );

  // Fetched newest-first for the range window, rendered oldest-first.
  return rows.map((r) => toMessage(r, selfId)).reverse();
}

export async function sendMessage(
  db: Client,
  input: {
    conversationId: string;
    senderId: string;
    kind?: 'text' | 'image' | 'file' | 'voice';
    body?: string;
    attachments?: Array<{
      storagePath: string;
      fileName?: string;
      mimeType?: string;
      sizeBytes?: number;
      durationMs?: number;
      width?: number;
      height?: number;
    }>;
  },
): Promise<Message> {
  const message = unwrap<Row>(
    await db
      .from('messages')
      .insert({
        conversation_id: input.conversationId,
        sender_id: input.senderId,
        kind: input.kind ?? 'text',
        body: input.body ?? null,
      })
      .select('*')
      .single(),
  );

  if (input.attachments?.length) {
    const { error } = await db.from('message_attachments').insert(
      input.attachments.map((a) => ({
        message_id: message.id,
        storage_path: a.storagePath,
        file_name: a.fileName ?? null,
        mime_type: a.mimeType ?? null,
        size_bytes: a.sizeBytes ?? null,
        duration_ms: a.durationMs ?? null,
        width: a.width ?? null,
        height: a.height ?? null,
      })),
    );
    if (error) throw error;
  }

  return toMessage({ ...message, message_attachments: [] }, input.senderId);
}

/**
 * Marks the thread read by stamping the caller's participant row. Unread counts
 * derive from this timestamp rather than a counter, so two devices reading the
 * same thread converge instead of double-decrementing.
 */
export async function markConversationRead(db: Client, conversationId: string, selfId: string) {
  const { error } = await db
    .from('conversation_participants')
    .update({ last_read_at: new Date().toISOString() })
    .eq('conversation_id', conversationId)
    .eq('user_id', selfId);
  if (error) throw error;
}

/** Soft delete — "this message was deleted" needs the row to survive. */
export async function deleteMessage(db: Client, messageId: string) {
  const { error } = await db
    .from('messages')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', messageId);
  if (error) throw error;
}

// ── Notifications ──────────────────────────────────────────────────────────

export async function fetchNotifications(
  db: Client,
  opts: { unreadOnly?: boolean } & PageParams = {},
): Promise<Notification[]> {
  const [from, to] = toRange(opts);
  let q = db
    .from('notifications')
    .select('*')
    .order('created_at', { ascending: false })
    .range(from, to);

  if (opts.unreadOnly) q = q.is('read_at', null);

  return unwrapList<Row>(await q).map(toNotification);
}

/** `null` marks everything read; an array marks just those. */
export async function markNotificationsRead(db: Client, ids?: string[]): Promise<number> {
  // `undefined` rather than `null`: the SQL parameter defaults to null when
  // omitted, and the generated signature types an omitted argument as optional.
  const { data, error } = await db.rpc('mark_notifications_read', { p_ids: ids });
  if (error) throw error;
  return (data as number) ?? 0;
}

/** One round trip for every badge in the shell. */
export async function fetchUnreadCounts(db: Client): Promise<UnreadCounts> {
  const { data, error } = await db.rpc('get_unread_counts');
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  return { notifications: row?.notifications ?? 0, messages: row?.messages ?? 0 };
}
