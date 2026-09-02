'use client';

import { useEffect, useMemo, useState } from 'react';
import { formatRelative } from '@/lib/utils';
import { koboToNaira } from '@/lib/query/helpers';
import {
  useConversations,
  useConversationsRealtime,
  useConversationRealtime,
  useMessages,
  useSendMessage,
  useMarkConversationRead,
  useAttachmentUrls,
} from '@/modules/messaging/hooks';
import type { AttachmentType } from './attachments/attachment';
import { useVendorOrders } from '@/modules/vendor/hooks';
import type { ChatContact, ChatCustomer } from '@/modules/vendor/types';
import { ChatList, ChatFilter } from './chat-list';
import { ChatWindow } from './chat-window';
import { ChatCustomerPanel } from './chat-panel';
import { ChatMediaDialog } from './chat-media-dialog';
import { ChatCustomerDialog } from './chat-customer-dialog';
import { ChatOrderDialog } from './chat-order-dialog';
import { ChatReportDialog } from './chat-report-dialog';
import { Attachment } from './attachments/attachment';
import { ChatMessage } from '@/modules/vendor/types';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { toast } from '@/components/ui/toast';
import { useIsHydrated } from '@/hooks/use-is-hydrated';
import {
  ChatTheme,
  ConversationPrefs,
  DEFAULT_PREFS,
  useChatStore,
} from '@/store/use-chat-store';

/*
 * Stable empty values used before hydration. zustand's persist middleware reads
 * localStorage synchronously, so the first client render would otherwise differ
 * from the server HTML and trip a hydration mismatch.
 */
const NO_PREFS: Record<string, ConversationPrefs> = {};
const NO_IDS: string[] = [];

type ConfirmKind = 'clear' | 'delete' | 'block';

/**
 * The viewer switches on a coarse category, not the raw MIME type. Anything
 * unrecognised falls back to 'document', which renders a download chip - the
 * one presentation that is safe for a format we cannot preview.
 */
function mimeToAttachmentType(mime: string | null): AttachmentType {
  if (!mime) return 'document';
  if (mime.startsWith('image/')) return 'image';
  if (mime.startsWith('video/')) return 'video';
  if (mime.startsWith('audio/')) return 'audio';
  return 'document';
}


export default function ChatComponent() {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<ChatFilter>('all');

  const [customerOpen, setCustomerOpen] = useState(false);
  const [orderOpen, setOrderOpen] = useState(false);
  const [mediaOpen, setMediaOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [confirm, setConfirm] = useState<ConfirmKind | null>(null);

  const hydrated = useIsHydrated();

  /* ------------------------------------------------------------------ */
  /*                             Live data                              */
  /* ------------------------------------------------------------------ */

  // Thread list + open thread. Two channels: one for the list (a new message in
  // any thread reorders it) and one filtered to the open conversation.
  useConversationsRealtime();
  useConversationRealtime(selectedId ?? undefined);

  const { data: conversations = [], isLoading: threadsLoading } = useConversations({
    pageSize: 50,
  });
  const { data: threadMessages = [], isLoading: messagesLoading } = useMessages(
    selectedId ?? undefined,
  );
  const send = useSendMessage(selectedId ?? '');
  const markRead = useMarkConversationRead();

  // The customer panel cannot join `profiles` - a vendor has no read on it. All
  // of it is derived from orders the vendor already owns, plus the contact
  // snapshot taken at checkout.
  const { data: vendorOrders = [] } = useVendorOrders();

  const contacts: ChatContact[] = useMemo(
    () =>
      conversations.map((c) => ({
        id: c.id,
        name: c.title,
        avatarUrl: c.avatarUrl ?? undefined,
        lastMessage: c.lastMessagePreview ?? '',
        timeAgo: formatRelative(c.lastMessageAt),
        unreadCount: c.unreadCount || undefined,
        hasUnread: c.hasUnread,
      })),
    [conversations],
  );

  const customersById: Record<string, ChatCustomer> = useMemo(() => {
    const out: Record<string, ChatCustomer> = {};

    for (const c of conversations) {
      const theirOrders = vendorOrders.filter((o) => o.studentId === c.counterpartId);
      const first = theirOrders[theirOrders.length - 1];

      out[c.id] = {
        id: c.counterpartId ?? c.id,
        name: theirOrders[0]?.customerName ?? c.title,
        avatarUrl: c.avatarUrl ?? undefined,
        location: theirOrders[0]?.deliveryAddress ?? 'Not provided',
        memberSince: first ? formatRelative(first.placedAt) : '-',
        totalOrders: theirOrders.length,
        totalSpent: koboToNaira(
          theirOrders.reduce((sum, o) => sum + o.totalKobo, 0),
        ).toLocaleString('en-NG', { style: 'currency', currency: 'NGN', maximumFractionDigits: 0 }),
        recentOrders: theirOrders.slice(0, 5).map((o) => ({
          orderId: o.id,
          items: o.lines.map((l) => l.name).join(', ') || '-',
          total: koboToNaira(o.totalKobo).toLocaleString('en-NG', {
            style: 'currency',
            currency: 'NGN',
            maximumFractionDigits: 0,
          }),
          status:
            o.status === 'delivered'
              ? 'Completed'
              : o.status === 'cancelled'
                ? 'Cancelled'
                : o.status === 'pending'
                  ? 'Pending'
                  : 'Processing',
        })),
      };
    }

    return out;
  }, [conversations, vendorOrders]);

  const storedPrefs = useChatStore((state) => state.prefs);
  const storedDeleted = useChatStore((state) => state.deletedIds);

  const toggleMuted = useChatStore((state) => state.toggleMuted);
  const togglePinned = useChatStore((state) => state.togglePinned);
  const toggleArchived = useChatStore((state) => state.toggleArchived);
  const setBlocked = useChatStore((state) => state.setBlocked);
  const setReported = useChatStore((state) => state.setReported);
  const setTheme = useChatStore((state) => state.setTheme);
  const markCleared = useChatStore((state) => state.markCleared);
  const unmarkCleared = useChatStore((state) => state.unmarkCleared);
  const deleteConversation = useChatStore((state) => state.deleteConversation);
  const restoreConversation = useChatStore((state) => state.restoreConversation);

  const prefs = hydrated ? storedPrefs : NO_PREFS;
  const deletedIds = hydrated ? storedDeleted : NO_IDS;

  const prefsFor = (id: string): ConversationPrefs => prefs[id] ?? DEFAULT_PREFS;

  const archivedCount = useMemo(
    () =>
      contacts.filter(
        (contact) => !deletedIds.includes(contact.id) && (prefs[contact.id]?.archived ?? false),
      ).length,
    [contacts, prefs, deletedIds],
  );

  /*
   * Unread is counted across BOTH tabs, deliberately.
   *
   * Archiving is the vendor tidying their own inbox; it says nothing about
   * whether the customer is still waiting. Excluding archived threads here would
   * let a vendor archive a conversation and lose the only signal that someone
   * needs a reply - so the badge counts every thread with unread messages, and
   * the Unread tab shows them all.
   */
  const unreadCount = useMemo(
    () =>
      contacts.filter(
        (contact) => !deletedIds.includes(contact.id) && contact.hasUnread,
      ).length,
    [contacts, deletedIds],
  );

  /*
   * Conversations for the current tab: deleted ones are gone entirely; 'all' and
   * 'archived' partition by the archived flag, while 'unread' cuts across both.
   * Pinned chats float to the top of whichever list they're in.
   */
  const visibleContacts = useMemo(() => {
    const query = search.trim().toLowerCase();

    const list = contacts.filter((contact) => {
      if (deletedIds.includes(contact.id)) return false;

      const archived = prefs[contact.id]?.archived ?? false;

      if (filter === 'unread') {
        if (!contact.hasUnread) return false;
      } else if (archived !== (filter === 'archived')) {
        return false;
      }

      return !query || contact.name.toLowerCase().includes(query);
    });

    return [...list].sort(
      (a, b) => Number(prefs[b.id]?.pinned ?? false) - Number(prefs[a.id]?.pinned ?? false),
    );
  }, [contacts, search, filter, prefs, deletedIds]);

  const selectedContact = selectedId
    ? contacts.find((contact) => contact.id === selectedId)
    : undefined;

  const clearedIds = useChatStore((state) => state.clearedIds);

  /*
   * "Clear chat" is a LOCAL preference, not a delete: the other party still has
   * the thread, and a vendor hiding their own copy must not destroy the
   * customer's. So the messages stay on the server and are filtered out here.
   */
  /*
   * Attachments live in a PRIVATE bucket, so there is no URL to construct -
   * each one needs a signed link. They are fetched as a batch (one round trip
   * per thread rather than one per file) and cached separately from the
   * messages, because signed links expire on their own schedule.
   */
  const attachmentPaths = useMemo(
    () => threadMessages.flatMap((m) => m.attachments.map((a) => a.storagePath)),
    [threadMessages],
  );
  const { data: signedUrls = {} } = useAttachmentUrls(attachmentPaths);

  const selectedMessages: ChatMessage[] = useMemo(() => {
    if (!selectedId || clearedIds.includes(selectedId)) return [];

    return threadMessages.map((m) => ({
      id: m.id,
      content: m.body ?? '',
      isVendor: m.isMine,
      timestamp: new Date(m.createdAt).toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
      }),
      attachments: m.attachments
        // A link that has not resolved yet is skipped rather than rendered
        // broken; the query refetches and it appears on the next pass.
        .filter((a) => signedUrls[a.storagePath])
        .map((a) => ({
          id: a.id,
          // No File: this came from Storage. Display code reads name/mimeType.
          type: mimeToAttachmentType(a.mimeType),
          url: signedUrls[a.storagePath],
          name: a.fileName ?? 'Attachment',
          size: a.sizeBytes ?? 0,
          mimeType: a.mimeType ?? 'application/octet-stream',
          duration: a.durationMs ?? undefined,
          width: a.width ?? undefined,
          height: a.height ?? undefined,
        })),
    }));
  }, [selectedId, clearedIds, threadMessages, signedUrls]);
  const selectedCustomer = selectedId ? customersById[selectedId] : undefined;
  const selectedPrefs = selectedId ? prefsFor(selectedId) : DEFAULT_PREFS;
  const linkedOrder = selectedCustomer?.recentOrders[0];

  /*
   * Send. The mutation is optimistic, so the bubble appears immediately; files
   * are uploaded to Storage before the row is written, and the realtime channel
   * reconciles both sides afterwards.
   *
   * `Attachment` carries a real `File`, which is what Storage needs - the
   * in-memory object URL it also holds is only for the local preview.
   */
  const handleSend = (message: string, attachments: Attachment[]) => {
    if (!selectedId) return;

    const trimmed = message.trim();

    if (!trimmed && attachments.length === 0) return;

    send.mutate(
      {
        body: trimmed || undefined,
        // Only compose-time attachments carry a File; a forwarded one would
        // not. Filter rather than assert so the type stays honest.
        files: attachments.map((a) => a.file).filter((f): f is File => !!f),
      },
      {
        onError: (error) =>
          toast(error instanceof Error ? error.message : 'Message could not be sent'),
      },
    );

    // The thread has content again, so stop hiding it locally.
    unmarkCleared(selectedId);
  };

  /*
   * Opening a thread marks it read. Keyed on the id so switching threads
   * re-runs it, and guarded on `hydrated` so it does not fire during SSR.
   */
  useEffect(() => {
    if (!selectedId || !hydrated) return;

    markRead.mutate(selectedId);
    // `markRead` is a stable mutation object; including it would re-fire the
    // effect on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId, hydrated]);

  /* ------------------------------------------------------------------ */
  /*                            Menu actions                            */
  /* ------------------------------------------------------------------ */

  const handleToggleMute = () => {
    if (!selectedId) return;

    toggleMuted(selectedId);
    toast(selectedPrefs.muted ? 'Notifications unmuted' : 'Notifications muted');
  };

  const handleTogglePin = () => {
    if (!selectedId) return;

    togglePinned(selectedId);
    toast(selectedPrefs.pinned ? 'Conversation unpinned' : 'Conversation pinned');
  };

  const handleToggleArchive = () => {
    if (!selectedId) return;

    const wasArchived = selectedPrefs.archived;

    toggleArchived(selectedId);

    // The chat just left the tab being viewed, so drop the selection.
    setSelectedId(null);

    toast(wasArchived ? 'Conversation unarchived' : 'Conversation archived', {
      action: {
        label: 'Undo',
        onClick: () => toggleArchived(selectedId),
      },
    });
  };

  const handleToggleBlock = () => {
    if (!selectedId) return;

    if (selectedPrefs.blocked) {
      setBlocked(selectedId, false);
      toast(`${selectedContact?.name ?? 'Customer'} unblocked`);
      return;
    }

    setConfirm('block');
  };

  const handleSetTheme = (theme: ChatTheme) => {
    if (!selectedId) return;

    setTheme(selectedId, theme);
  };

  const handleReportSubmit = (reason: string, details: string) => {
    if (!selectedId) return;

    setReported(selectedId, true);
    setReportOpen(false);

    toast(`Report submitted: ${reason}${details ? '   details included' : ''}`);
  };

  /**
   * Builds the export payload and hands it to the browser as a download.
   */
  const handleExport = (format: 'txt' | 'json') => {
    if (!selectedContact) return;

    const name = selectedContact.name;

    const content =
      format === 'json'
        ? JSON.stringify(
            {
              customer: name,
              exportedAt: new Date().toISOString(),
              messages: selectedMessages.map((item) => ({
                from: item.isVendor ? 'You' : name,
                timestamp: item.timestamp,
                content: item.content,
                attachments: (item.attachments ?? []).map((attachment) => ({
                  name: attachment.name,
                  type: attachment.type,
                })),
              })),
            },
            null,
            2,
          )
        : [
            `Conversation with ${name}`,
            `Exported ${new Date().toLocaleString()}`,
            '',
            ...selectedMessages.map((item) => {
              const who = item.isVendor ? 'You' : name;
              const files = (item.attachments ?? [])
                .map((attachment) => `[${attachment.type}: ${attachment.name}]`)
                .join(' ');

              return `[${item.timestamp}] ${who}: ${item.content}${files ? ` ${files}` : ''}`;
            }),
          ].join('\n');

    const blob = new Blob([content], {
      type: format === 'json' ? 'application/json' : 'text/plain;charset=utf-8',
    });

    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');

    link.href = url;
    link.download = `chat-${name.toLowerCase().replace(/\s+/g, '-')}.${format}`;

    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    URL.revokeObjectURL(url);

    toast(`Chat exported as .${format}`);
  };

  /*
   * Confirmed destructive actions. Kept together so the ConfirmDialog has a
   * single place to dispatch to.
   */
  const confirmConfig: Record<
    ConfirmKind,
    { title: string; description: string; confirmLabel: string; run: () => void }
  > = {
    clear: {
      title: 'Clear this conversation?',
      // Deliberately explicit that this is one-sided. The vendor is hiding
      // their own copy; the customer still has the thread, and one party must
      // not be able to erase the other's record of what was agreed.
      description:
        'Messages are hidden from your inbox. The customer keeps their copy, and nothing is deleted.',
      confirmLabel: 'Clear',
      run: () => {
        if (!selectedId) return;

        markCleared(selectedId);
        toast('Conversation cleared from your inbox');
      },
    },
    delete: {
      title: 'Delete this conversation?',
      description: 'The conversation is removed from your inbox.',
      confirmLabel: 'Delete',
      run: () => {
        if (!selectedId) return;

        const id = selectedId;

        deleteConversation(id);
        setSelectedId(null);

        toast('Conversation deleted', {
          action: { label: 'Undo', onClick: () => restoreConversation(id) },
        });
      },
    },
    block: {
      title: `Block ${selectedContact?.name ?? 'this customer'}?`,
      description: "They won't be able to reach you and you can't send messages until unblocked.",
      confirmLabel: 'Block',
      run: () => {
        if (!selectedId) return;

        setBlocked(selectedId, true);
        toast(`${selectedContact?.name ?? 'Customer'} blocked`);
      },
    },
  };

  const activeConfirm = confirm ? confirmConfig[confirm] : null;

  const chatWindowProps = selectedContact && {
    contact: selectedContact,
    messages: selectedMessages,
    linkedOrder,
    onSend: handleSend,
    prefs: selectedPrefs,
    onViewCustomer: () => setCustomerOpen(true),
    onOrderDetails: () => setOrderOpen(true),
    onMedia: () => setMediaOpen(true),
    onToggleMute: handleToggleMute,
    onTogglePin: handleTogglePin,
    onToggleArchive: handleToggleArchive,
    onToggleBlock: handleToggleBlock,
    onSetTheme: handleSetTheme,
    onExport: handleExport,
    onReport: () => setReportOpen(true),
    onClear: () => setConfirm('clear'),
    onDelete: () => setConfirm('delete'),
  };

  const listProps = {
    contacts: visibleContacts,
    selectedId: selectedId ?? undefined,
    onSelect: setSelectedId,
    search,
    onSearchChange: setSearch,
    filter,
    onFilterChange: setFilter,
    archivedCount,
    unreadCount,
    prefs,
  };

  return (
    <>
      <div className="border-ink/5 flex h-[calc(100vh-170px)] overflow-hidden rounded-xl border bg-white">
        {/* Mobile */}
        <div className="h-full w-full lg:hidden">
          {!chatWindowProps ? (
            <ChatList {...listProps} />
          ) : (
            <ChatWindow {...chatWindowProps} onBack={() => setSelectedId(null)} />
          )}
        </div>

        {/* Desktop */}
        <div className="hidden h-full w-full lg:flex">
          <ChatList {...listProps} />

          {chatWindowProps && (
            <>
              <ChatWindow {...chatWindowProps} />

              {/* Keyed by conversation id, so there is no index-0 fallback to lean on. */}
              {selectedCustomer && (
                <ChatCustomerPanel
                  customer={selectedCustomer}
                  onViewProfile={() => setCustomerOpen(true)}
                  onViewAllOrders={() => setOrderOpen(true)}
                />
              )}
            </>
          )}
        </div>
      </div>

      <ChatCustomerDialog
        open={customerOpen}
        onOpenChange={setCustomerOpen}
        customer={selectedCustomer}
      />

      <ChatOrderDialog
        open={orderOpen}
        onOpenChange={setOrderOpen}
        order={linkedOrder}
        orders={selectedCustomer?.recentOrders}
      />

      <ChatMediaDialog
        open={mediaOpen}
        onOpenChange={setMediaOpen}
        messages={selectedMessages}
        contactName={selectedContact?.name ?? 'this customer'}
      />

      <ChatReportDialog
        open={reportOpen}
        onOpenChange={setReportOpen}
        contactName={selectedContact?.name ?? 'customer'}
        onSubmit={handleReportSubmit}
      />

      {activeConfirm && (
        <ConfirmDialog
          open
          onOpenChange={(open) => {
            if (!open) setConfirm(null);
          }}
          title={activeConfirm.title}
          description={activeConfirm.description}
          confirmLabel={activeConfirm.confirmLabel}
          destructive
          onConfirm={() => {
            activeConfirm.run();
            setConfirm(null);
          }}
        />
      )}
    </>
  );
}
