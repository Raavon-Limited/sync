'use client';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui';
import { Input } from '@/components/ui';
import { BellOff, Pin, Search } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ChatContact } from '@/modules/vendor/types';
import { ConversationPrefs, DEFAULT_PREFS } from '@/store/use-chat-store';

export type ChatFilter = 'all' | 'archived';

interface ChatListProps {
  contacts: ChatContact[];
  selectedId?: string;
  onSelect: (id: string) => void;
  search: string;
  onSearchChange: (value: string) => void;
  filter: ChatFilter;
  onFilterChange: (filter: ChatFilter) => void;
  archivedCount: number;
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
  prefs,
}: ChatListProps) {
  const tabs: { value: ChatFilter; label: string; count?: number }[] = [
    { value: 'all', label: 'All' },
    { value: 'archived', label: 'Archived', count: archivedCount },
  ];

  return (
    <div className="border-ink/5 flex h-full w-full flex-col border-r lg:w-72 lg:shrink-0">
      <div className="p-4">
        <h2 className="font-display text-ink mb-3 text-base font-semibold">Messages</h2>

        <div className="bg-ink/5 mb-3 flex gap-1 rounded-lg p-1">
          {tabs.map((tab) => (
            <button
              key={tab.value}
              type="button"
              onClick={() => onFilterChange(tab.value)}
              className={cn(
                'flex flex-1 items-center justify-center gap-1.5 rounded-md py-1.5 text-xs font-medium transition-colors',
                filter === tab.value
                  ? 'text-ink bg-white shadow-sm'
                  : 'text-muted hover:text-ink',
              )}
            >
              {tab.label}

              {tab.count ? (
                <span className="bg-ink/10 text-ink rounded-full px-1.5 text-[10px] leading-4">
                  {tab.count}
                </span>
              ) : null}
            </button>
          ))}
        </div>

        <div className="relative">
          <Search className="text-muted absolute top-1/2 left-3 size-3.5 -translate-y-1/2" />
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
          <p className="text-muted px-4 py-8 text-center text-xs">
            {filter === 'archived' ? 'No archived conversations.' : 'No conversations found.'}
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
                  ? 'bg-ink/5 border-ink border-l-2'
                  : 'hover:bg-ink/3 border-l-2 border-transparent',
              )}
            >
              <div className="relative shrink-0">
                <Avatar className="size-9">
                  <AvatarImage src={contact.avatarUrl} alt={contact.name} />
                  <AvatarFallback>{initials}</AvatarFallback>
                </Avatar>
                {contact.isOnline && (
                  <span className="absolute right-0 bottom-0 size-2.5 rounded-full bg-green-500 ring-2 ring-white" />
                )}
              </div>

              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-ink flex min-w-0 items-center gap-1 text-sm font-medium">
                    <span className="truncate">{contact.name}</span>

                    {pinned && <Pin className="text-muted size-3 shrink-0" />}
                    {muted && <BellOff className="text-muted size-3 shrink-0" />}
                  </p>

                  <span className="text-muted shrink-0 text-[11px]">{contact.timeAgo}</span>
                </div>
                <p className="text-muted truncate text-xs">{contact.lastMessage}</p>
              </div>

              {contact.unreadCount ? (
                <span
                  className={cn(
                    'flex size-5 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold text-white',
                    // A muted conversation still counts, it just stops shouting.
                    muted ? 'bg-ink/25' : 'bg-red-500',
                  )}
                >
                  {contact.unreadCount}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}
