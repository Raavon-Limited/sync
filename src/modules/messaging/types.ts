/**
 * Domain types for the 'messaging' module.
 *
 * `ChatContact` / `ChatMessage` in src/modules/vendor/types.ts are the existing
 * MOCK shapes the inbox renders today. These are the real ones. Migrate the
 * components to these   the differences are deliberate:
 *   - `timeAgo: string` becomes `createdAt: string` (ISO). Formatting a
 *     relative time on the server bakes in the render moment and goes stale.
 *   - `isVendor: boolean` becomes `isMine: boolean`. Whether a message is
 *     "mine" depends on who is looking, not on which side sent it   the same
 *     thread is read by both parties.
 */

export type MessageKind = 'text' | 'image' | 'file' | 'voice' | 'system';

export type ConversationKind = 'direct' | 'order' | 'booking' | 'service_request' | 'support';

export type NotificationKind =
  | 'booking'
  | 'order'
  | 'message'
  | 'payment'
  | 'verification'
  | 'delivery'
  | 'review'
  | 'promotion'
  | 'system';

export interface MessageAttachment {
  id: string;
  storagePath: string;
  fileName: string | null;
  mimeType: string | null;
  sizeBytes: number | null;
  /** Voice notes only   drives the waveform length. */
  durationMs: number | null;
  width: number | null;
  height: number | null;
}

export interface Message {
  id: string;
  conversationId: string;
  senderId: string | null;
  /** Resolved against the viewer, not the sender's role. */
  isMine: boolean;
  kind: MessageKind;
  body: string | null;
  isDeleted: boolean;
  editedAt: string | null;
  createdAt: string;
  attachments: MessageAttachment[];
}

export interface Conversation {
  id: string;
  kind: ConversationKind;
  subjectType: string | null;
  subjectId: string | null;
  /** The counterpart's name   depends on who is asking. */
  title: string;
  avatarUrl: string | null;
  counterpartId: string | null;
  lastMessageAt: string;
  lastMessagePreview: string | null;
  /**
   * True when the thread has activity the caller has not seen.
   *
   * Derived from `last_message_at > my last_read_at`, which is exact and free -
   * both values are already in the row. A precise unread COUNT is not: it needs
   * a per-conversation aggregate compared against a per-participant timestamp,
   * which PostgREST cannot express and which therefore wants an RPC. Until that
   * exists, a truthful boolean beats a fabricated number.
   */
  hasUnread: boolean;
  /** Exact per-thread count. 0 until the RPC above exists - see `hasUnread`. */
  unreadCount: number;
}

export interface Notification {
  id: string;
  kind: NotificationKind;
  title: string;
  body: string;
  /** Path suffix under the dashboard base, e.g. 'bookings'. */
  href: string | null;
  action: 'chat' | null;
  entityType: string | null;
  entityId: string | null;
  isUnread: boolean;
  createdAt: string;
}

export interface UnreadCounts {
  notifications: number;
  messages: number;
}
