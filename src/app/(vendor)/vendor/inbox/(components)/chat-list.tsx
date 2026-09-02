'use client';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui';
import { Input } from '@/components/ui';
import { BellOff, Pin, Search } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ChatContact } from '@/modules/vendor/types';
import { ConversationPrefs, DEFAULT_PREFS } from '@/store/use-chat-store';

/**
 * Inbox tabs.
 *
 * 'unread' is a VIEW over the same conversations, not a separate bucket the way
 * 'archived' is: a thread can be unread and archived at once. The filtering in
 * chat-component reflects that - unread shows unread threads regardless of
 * archive state, so a customer waiting on a reply cannot be hidden by having
 * archived the thread.
 */
export type ChatFilter = 'all' | 'unread' | 'archived';

interface ChatListProps {
  contacts: ChatContact[];
  selectedId?: string;
  onSelect: (id: string) => void;
  search: string;
  onSearchChange: (value: string) => void;
  filter: ChatFilter;
  onFilterChange: (filter: ChatFilter) => void;
  archivedCount: number;
  /** Threads with at least one message the vendor has not read. */
  unreadCount: number;
  prefs: Record<string, ConversationPrefs>;
}

export function ChatList({
  contacts,
  selectedId,
  onSelect,
  search,
  onSearchChange,
  filter,
  onFilterChange,
  archivedCount,
  unreadCount,
  prefs,
}: ChatListProps) {
  const tabs: { value: ChatFilter; label: string; count?: number }[] = [
    { value: 'all', label: 'All' },
    { value: 'unread', label: 'Unread', count: unreadCount },
    { value: 'archived', label: 'Archived', count: archivedCount },
  ];

  return (
    <div className="border-line/10 flex h-full w-full flex-col border-r lg:w-72 lg:shrink-0">
      <div className="p-4">
        <h2 className="font-display text-content mb-3 text-base font-semibold">Messages</h2>

        <div className="bg-surface-deep mb-3 flex gap-1 rounded-lg p-1">
          {tabs.map((tab) => (
            <button
              key={tab.value}
              type="button"
              onClick={() => onFilterChange(tab.value)}
              className={cn(
                'flex flex-1 items-center justify-center gap-1.5 rounded-md py-1.5 text-xs font-medium transition-colors',
                filter === tab.value
                  ? 'text-content bg-panel shadow-sm'
                  : 'text-content-muted hover:text-content',
              )}
            >
              {tab.label}

              {tab.count ? (
                <span className="bg-line/10 text-content rounded-full px-1.5 text-[10px] leading-4">
                  {tab.count}
                </span>
              ) : null}
            </button>
          ))}
        </div>

        <div className="relative">
          <Search className="text-content-muted absolute top-1/2 left-3 size-3.5 -translate-y-1/2" />
          <Input
            placeholder="Search conversations..."
            className="pl-8 text-xs !ring-0 !outline-none focus-visible:!ring-0 focus-visible:!ring-offset-0"
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
          />
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {contacts.length === 0 && (
          <p className="text-content-muted px-4 py-8 text-center text-xs">
            {filter === 'archived'
              ? 'No archived conversations.'
              : filter === 'unread'
                ? 'All caught up - nothing unread.'
                : 'No conversations found.'}
          </p>
        )}

        {contacts.map((contact) => {
          const initials = contact.name
            .split(' ')
            .map((n) => n[0])
            .join('')
            .slice(0, 2);
          const isSelected = contact.id === selectedId;
          const { pinned, muted } = prefs[contact.id] ?? DEFAULT_PREFS;

          return (
            <button
              key={contact.id}
              onClick={() => onSelect(contact.id)}
              className={cn(
                'flex w-full items-center gap-3 px-4 py-3 text-left transition-colors',
                isSelected
                  ? 'bg-surface-deep border-accent-fg border-l-2'
                  : 'hover:bg-surface-deep border-l-2 border-transparent',
              )}
            >
              <div className="relative shrink-0">
                <Avatar className="size-9">
                  <AvatarImage src={contact.avatarUrl} alt={contact.name} />
                  <AvatarFallback>{initials}</AvatarFallback>
                </Avatar>
                {contact.isOnline && (
                  <span className="bg-accent-fg ring-panel absolute right-0 bottom-0 size-2.5 rounded-full ring-2" />
                )}
              </div>

              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-content flex min-w-0 items-center gap-1 text-sm font-medium">
                    <span className="truncate">{contact.name}</span>

                    {pinned && <Pin className="text-content-muted size-3 shrink-0" />}
                    {muted && <BellOff className="text-content-muted size-3 shrink-0" />}
                  </p>

                  <span className="text-content-muted shrink-0 text-[11px]">{contact.timeAgo}</span>
                </div>
                <p className="text-content-muted truncate text-xs">{contact.lastMessage}</p>
              </div>

              {contact.unreadCount ? (
                <span className="bg-coral text-cream ml-auto flex size-5 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold">
                  {contact.unreadCount}
                </span>
              ) : contact.hasUnread ? (
                /* No exact count available (see Conversation.hasUnread), so a
                   dot rather than a fabricated number. */
                <span
                  aria-label="Unread messages"
                  className="bg-coral ml-auto size-2 shrink-0 rounded-full"
                />
              ) : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}
