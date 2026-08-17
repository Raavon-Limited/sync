'use client';

import { useMemo, useState } from 'react';
import { mockContacts, mockCustomers, mockMessages } from '@/mock/chat';
import { findConversationId } from '@/lib/order-chat';
import type { ChatOrder } from '@/modules/vendor/types';
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
import { ChatTheme, ConversationPrefs, DEFAULT_PREFS, useChatStore } from '@/store/use-chat-store';

/*
 * Stable empty values used before hydration. zustand's persist middleware reads
 * localStorage synchronously, so the first client render would otherwise differ
 * from the server HTML and trip a hydration mismatch.
 */
const NO_PREFS: Record<string, ConversationPrefs> = {};
const NO_IDS: string[] = [];

type ConfirmKind = 'clear' | 'delete' | 'block';

/**
 * Seeds the in-memory message map from the mock data, skipping conversations
 * the vendor has cleared. Messages themselves aren't persisted (attachment
 * object URLs don't survive a reload), so a cleared chat simply stays empty.
 */
function seedMessages(): Record<string, ChatMessage[]> {
  const { clearedIds } = useChatStore.getState();

  return Object.fromEntries(
    Object.entries(mockMessages).map(([id, list]) => [id, clearedIds.includes(id) ? [] : list]),
  );
}

interface ChatComponentProps {
  /** Conversation to open on arrival - see lib/order-chat. */
  initialContactId?: string;
  /** Fallback used when the id is missing or no longer matches a conversation. */
  initialCustomerName?: string;
  /**
   * Order the vendor arrived here to discuss. Shown on the chat's linked-order
   * pill in place of the customer's most recent order.
   */
  focusedOrder?: ChatOrder;
}

export default function ChatComponent({
  initialContactId,
  initialCustomerName,
  focusedOrder,
}: ChatComponentProps = {}) {
  /*
   * Which conversation the incoming deep link points at. Resolved from props
   * (not state) so the server and first client render agree.
   */
  const requestedId = useMemo(
    () =>
      findConversationId(mockContacts, {
        contactId: initialContactId,
        customerName: initialCustomerName,
      }),
    [initialContactId, initialCustomerName],
  );

  /*
   * Seeded once on mount, which is enough: reaching the inbox from the orders
   * table is a route change, so this component always mounts fresh with the new
   * params. No effect syncing it - that would only matter if the query could
   * change while the inbox stayed mounted, which nothing does today.
   */
  const [selectedId, setSelectedId] = useState<string | null>(requestedId);

  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<ChatFilter>('all');
  const [messagesByConversation, setMessagesByConversation] = useState(seedMessages);

  const [customerOpen, setCustomerOpen] = useState(false);
  const [orderOpen, setOrderOpen] = useState(false);
  const [mediaOpen, setMediaOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [confirm, setConfirm] = useState<ConfirmKind | null>(null);

  const hydrated = useIsHydrated();

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
      mockContacts.filter(
        (contact) => !deletedIds.includes(contact.id) && (prefs[contact.id]?.archived ?? false),
      ).length,
    [prefs, deletedIds],
  );

  /*
   * Conversations for the current tab: deleted ones are gone entirely, the
   * archived flag decides which tab a chat belongs to, and pinned chats float
   * to the top of whichever list they're in.
   */
  const visibleContacts = useMemo(() => {
    const query = search.trim().toLowerCase();

    const list = mockContacts.filter((contact) => {
      if (deletedIds.includes(contact.id)) return false;

      const archived = prefs[contact.id]?.archived ?? false;

      if (archived !== (filter === 'archived')) return false;

      return !query || contact.name.toLowerCase().includes(query);
    });

    return [...list].sort(
      (a, b) => Number(prefs[b.id]?.pinned ?? false) - Number(prefs[a.id]?.pinned ?? false),
    );
  }, [search, filter, prefs, deletedIds]);

  const selectedContact = selectedId
    ? mockContacts.find((contact) => contact.id === selectedId)
    : undefined;

  const selectedMessages = selectedId ? (messagesByConversation[selectedId] ?? []) : [];
  const selectedCustomer = selectedId ? mockCustomers[selectedId] : undefined;
  const selectedPrefs = selectedId ? prefsFor(selectedId) : DEFAULT_PREFS;
  /*
   * The order pill shows what the vendor came here to talk about; without a
   * deep link it falls back to the customer's most recent order as before.
   */
  const linkedOrder = focusedOrder ?? selectedCustomer?.recentOrders[0];

  //SEND FUNCTION
  const handleSend = (message: string, attachments: Attachment[]) => {
    if (!selectedId) return;

    const trimmed = message.trim();

    if (!trimmed && attachments.length === 0) return;

    const newMessage: ChatMessage = {
      id: crypto.randomUUID(),
      content: trimmed,
      isVendor: true,
      timestamp: new Date().toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
      }),
      attachments,
    };

    setMessagesByConversation((prev) => ({
      ...prev,
      [selectedId]: [...(prev[selectedId] ?? []), newMessage],
    }));

    // The conversation has content again, so stop suppressing its mock seed.
    unmarkCleared(selectedId);
  };

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

    toast(`Report submitted: ${reason}${details ? ' — details included' : ''}`);
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
                  name: attachment.file.name,
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
                .map((attachment) => `[${attachment.type}: ${attachment.file.name}]`)
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
      description: 'Every message will be removed. The conversation itself stays in your inbox.',
      confirmLabel: 'Clear',
      run: () => {
        if (!selectedId) return;

        setMessagesByConversation((prev) => ({ ...prev, [selectedId]: [] }));
        markCleared(selectedId);
        toast('Conversation cleared');
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

              {/* mockCustomers is keyed by id, so there is no index-0 fallback to lean on. */}
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
