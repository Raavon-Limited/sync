/**
 * Data access for the 'messaging' module   conversations, messages,
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

/** id -> display fields, from the conversation_counterparties RPC. */
export type PartyLookup = Map<string, { fullName: string | null; businessName: string | null; logoUrl: string | null }>;

const toConversation = (r: Row, selfId?: string, parties?: PartyLookup): Conversation => {
  // A direct thread's title is "the other person", which only the client can
  // resolve because it depends on who is asking.
  const others = (r.conversation_participants ?? []).filter((p: Row) => p.user_id !== selfId);
  // Names do NOT come from an embed. public.profiles is locked to the caller's
  // own row (20260814102248_fix_profile_exposure), so `profile:profiles(...)`
  // returns null here rather than erroring   which is how every thread ended up
  // titled "Conversation". The RPC discloses just the display fields instead.
  const counterpart = others[0] ? parties?.get(others[0].user_id) : undefined;

  // My own participant row holds the read watermark.
  const me = (r.conversation_participants ?? []).find((p: Row) => p.user_id === selfId);
  const lastReadAt = me?.last_read_at ? new Date(me.last_read_at).getTime() : 0;
  const lastMessageAt = r.last_message_at ? new Date(r.last_message_at).getTime() : 0;

  return {
    id: r.id,
    kind: r.kind,
    subjectType: r.subject_type,
    subjectId: r.subject_id,
    // Storefront first: a student looking at this thread wants the business
    // name, not the owner's legal name. A student counterpart has no
    // vendor_profile, so it falls through to full_name.
    title: counterpart?.businessName ?? counterpart?.fullName ?? 'Conversation',
    avatarUrl: counterpart?.logoUrl ?? null,
    counterpartId: others[0]?.user_id ?? null,
    lastMessageAt: r.last_message_at,
    lastMessagePreview: r.last_message_preview,
    // Derived, never stored   a stored counter drifts across devices.
    // A thread with no read watermark yet counts as unread.
    hasUnread: lastMessageAt > lastReadAt,
    unreadCount: 0,
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

/**
 * No profile joins: the counterparty's name is not reachable by embed (see
 * toConversation). Participants themselves are readable   the RLS policy on
 * conversation_participants is membership-based, not ownership-based.
 */
const CONVERSATION_SELECT = `id, kind, subject_type, subject_id, last_message_at,
  last_message_preview, conversation_participants(user_id, last_read_at)`;

/** Display fields for everyone the caller shares the given threads with. */
export async function fetchCounterparties(db: Client, conversationIds: string[]): Promise<PartyLookup> {
  const out: PartyLookup = new Map();
  if (!conversationIds.length) return out;
  const { data, error } = await db.rpc('conversation_counterparties', {
    p_conversation_ids: conversationIds,
  });
  if (error) throw error;
  for (const row of (data ?? []) as Row[]) {
    out.set(row.user_id, {
      fullName: row.full_name ?? null,
      businessName: row.business_name ?? null,
      logoUrl: row.logo_url ?? null,
    });
  }
  return out;
}

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
        CONVERSATION_SELECT,
      )
      .is('archived_at', null)
      // Ordering by the denormalised column is why it exists   sorting by a
      // joined aggregate is unusable once a vendor has a few hundred threads.
      .order('last_message_at', { ascending: false })
      .range(from, to),
  );

  // One extra round-trip for the whole page, not one per thread.
  const parties = await fetchCounterparties(db, rows.map((r) => r.id));
  return rows.map((r) => toConversation(r, selfId, parties));
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
        CONVERSATION_SELECT,
      )
      .eq('id', conversationId)
      .maybeSingle(),
  );
  if (!row) return null;
  const parties = await fetchCounterparties(db, [row.id]);
  return toConversation(row, selfId, parties);
}

/** Idempotent   the RPC returns the existing thread if there is one. */
export async function openOrderConversation(db: Client, orderId: string): Promise<string> {
  const { data, error } = await db.rpc('open_order_conversation', { p_order_id: orderId });
  if (error) throw error;
  return data as string;
}

/**
 * Pre-order door: opens (or returns) the caller's thread with the vendor about
 * a listing. Idempotent per (listing, caller) rather than per listing   a
 * listing has many interested students, so scoping by subject alone would hand
 * the caller a stranger's thread.
 */
export async function openListingConversation(db: Client, listingId: string): Promise<string> {
  const { data, error } = await db.rpc('open_listing_conversation', { p_listing_id: listingId });
  if (error) throw error;
  return data as string;
}

/**
 * Landlord thread for an existing booking. Idempotent per booking   two
 * parties, so the subject alone identifies the thread.
 */
export async function openBookingConversation(db: Client, bookingId: string): Promise<string> {
  const { data, error } = await db.rpc('open_booking_conversation', { p_booking_id: bookingId });
  if (error) throw error;
  return data as string;
}

/**
 * Landlord thread BEFORE any booking exists   "is this room still available".
 * Idempotent per (hostel, caller), not per hostel: many students enquire about
 * the same property, and a subject-only lookup would hand the caller a
 * stranger's thread.
 */
export async function openHostelConversation(db: Client, hostelId: string): Promise<string> {
  const { data, error } = await db.rpc('open_hostel_conversation', { p_hostel_id: hostelId });
  if (error) throw error;
  return data as string;
}

/** Vendor thread for a beauty / laundry / workmanship request. */
export async function openServiceConversation(db: Client, requestId: string): Promise<string> {
  const { data, error } = await db.rpc('open_service_conversation', { p_request_id: requestId });
  if (error) throw error;
  return data as string;
}

/**
 * Rider thread, keyed by order. Separate from the order thread by design: a
 * rider joins partway through and must not read what was said before they were
 * assigned. Raises 'no rider assigned yet' until dispatch assigns one.
 */
export async function openDeliveryConversation(db: Client, orderId: string): Promise<string> {
  const { data, error } = await db.rpc('open_delivery_conversation', { p_order_id: orderId });
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

/** Soft delete   "this message was deleted" needs the row to survive. */
export async function deleteMessage(db: Client, messageId: string) {
  const { error } = await db
    .from('messages')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', messageId);
  if (error) throw error;
}

// ── Notifications ──────────────────────────────────────────────────────────

/**
 * The notification roles one dashboard shows. Mirrors
 * `private.notification_hats`: staff is a single hat, because notify_staff
 * stamps 'admin' and a super_admin must still see those alerts.
 */
function hatsFor(role: string): string[] {
  return role === 'admin' || role === 'super_admin' ? ['admin', 'super_admin'] : [role];
}

export async function fetchNotifications(
  db: Client,
  /**
   * `role` is the DASHBOARD being rendered (see NOTIFICATION_ROLE). Unstamped
   * rows show everywhere, which is what every row before 20260911150000 is.
   * Omit it for the old, unfiltered behaviour.
   */
  opts: { unreadOnly?: boolean; role?: string } & PageParams = {},
): Promise<Notification[]> {
  const [from, to] = toRange(opts);
  let q = db
    .from('notifications')
    .select('*')
    .order('created_at', { ascending: false })
    .range(from, to);

  if (opts.unreadOnly) q = q.is('read_at', null);
  // The same predicate get_unread_counts and mark_notifications_read apply. If
  // the list filters and they do not, the badge disagrees with the dropdown.
  if (opts.role) q = q.or(`role.is.null,role.in.(${hatsFor(opts.role).join(',')})`);

  return unwrapList<Row>(await q).map(toNotification);
}

/**
 * `undefined` ids marks everything read; an array marks just those.
 *
 * With a `role`, "everything" means everything on THIS dashboard. Without it,
 * clearing the staff bell also cleared a landlord badge the person had not seen.
 */
export async function markNotificationsRead(
  db: Client,
  ids?: string[],
  role?: string,
): Promise<number> {
  // `undefined` rather than `null`: the SQL parameter defaults to null when
  // omitted, and the generated signature types an omitted argument as optional.
  const { data, error } = await db.rpc('mark_notifications_read', { p_ids: ids, p_role: role });
  if (error) throw error;
  return (data as number) ?? 0;
}

/** One round trip for every badge in the shell. `role` scopes the notification
 *  count to one dashboard; the message count is per person either way. */
export async function fetchUnreadCounts(db: Client, role?: string): Promise<UnreadCounts> {
  const { data, error } = await db.rpc('get_unread_counts', { p_role: role });
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  return { notifications: row?.notifications ?? 0, messages: row?.messages ?? 0 };
}

// ── Attachments (Supabase Storage) ─────────────────────────────────────────

export const ATTACHMENT_BUCKET = 'message-attachments';

/**
 * Uploads one file and returns the row shape `sendMessage` expects.
 *
 * The path is `<userId>/<conversationId>/<random>-<name>` because the storage
 * policies authorize on the FIRST segment: a user may only write under their own
 * uuid. Changing this shape without changing the policies silently breaks
 * uploads with a permission error that looks like a bug in the client.
 *
 * The filename is prefixed with a random token rather than trusted as-is. Two
 * reasons: a user sending `receipt.pdf` twice must not overwrite the first, and
 * a crafted name should not be able to traverse or collide.
 */
export async function uploadAttachment(
  db: Client,
  input: { userId: string; conversationId: string; file: File },
): Promise<{
  storagePath: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
}> {
  const safeName = input.file.name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(-80);
  const token = crypto.randomUUID().slice(0, 8);
  const path = `${input.userId}/${input.conversationId}/${token}-${safeName}`;

  const { error } = await db.storage.from(ATTACHMENT_BUCKET).upload(path, input.file, {
    contentType: input.file.type || 'application/octet-stream',
    // Never overwrite: the random prefix makes collisions vanishingly unlikely,
    // and an unexpected collision should fail loudly rather than destroy a file.
    upsert: false,
  });
  if (error) throw error;

  return {
    storagePath: path,
    fileName: input.file.name,
    mimeType: input.file.type || 'application/octet-stream',
    sizeBytes: input.file.size,
  };
}

/**
 * Signed URL for a private attachment.
 *
 * The bucket is private, so there is no public URL to construct   `getPublicUrl`
 * would return a link that 400s. Signed URLs expire, which is the point: a link
 * copied out of the app stops working, rather than becoming a permanent
 * unauthenticated handle on someone's voice note.
 */
export async function getAttachmentUrl(
  db: Client,
  storagePath: string,
  expiresInSeconds = 3600,
): Promise<string | null> {
  const { data, error } = await db.storage
    .from(ATTACHMENT_BUCKET)
    .createSignedUrl(storagePath, expiresInSeconds);
  if (error) return null;
  return data?.signedUrl ?? null;
}

/** Batch variant   one round trip for a whole thread's media. */
export async function getAttachmentUrls(
  db: Client,
  paths: string[],
  expiresInSeconds = 3600,
): Promise<Record<string, string>> {
  if (paths.length === 0) return {};

  const { data, error } = await db.storage
    .from(ATTACHMENT_BUCKET)
    .createSignedUrls(paths, expiresInSeconds);
  if (error || !data) return {};

  return Object.fromEntries(
    data
      .filter((d) => d.signedUrl && d.path)
      .map((d) => [d.path as string, d.signedUrl as string]),
  );
}
