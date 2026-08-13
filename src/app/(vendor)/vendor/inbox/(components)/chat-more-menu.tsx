'use client';

import { useState } from 'react';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';

import {
  Archive,
  ArchiveRestore,
  Bell,
  BellOff,
  Check,
  ChevronLeft,
  ChevronRight,
  Download,
  Eraser,
  FileJson,
  FileText,
  Flag,
  FolderOpen,
  MoreHorizontal,
  Package,
  Palette,
  Pin,
  PinOff,
  Search,
  Shield,
  ShieldOff,
  Trash2,
  User,
} from 'lucide-react';

import { cn } from '@/lib/utils';
import { ChatTheme } from '@/store/use-chat-store';
import { CHAT_THEMES, CHAT_THEME_ORDER } from './chat-theme';

interface Props {
  muted: boolean;
  pinned: boolean;
  archived: boolean;
  blocked: boolean;
  theme: ChatTheme;

  onViewCustomer: () => void;
  onOrderDetails: () => void;
  onSearch: () => void;
  onMedia: () => void;
  onMute: () => void;
  onPin: () => void;
  onArchive: () => void;
  onTheme: (theme: ChatTheme) => void;
  onExport: (format: 'txt' | 'json') => void;
  onBlock: () => void;
  onReport: () => void;
  onClear: () => void;
  onDelete: () => void;
}

type Panel = 'main' | 'more' | 'theme' | 'export';

/*
 * Declared at module scope. Defining it inside ChatMoreMenu would create a new
 * component type on every render and remount the item each time.
 */
function BackItem({ onBack }: { onBack: (event: Event) => void }) {
  return (
    <>
      <DropdownMenu.Item className="menu-item" onSelect={onBack}>
        <ChevronLeft size={16} />
        Back
      </DropdownMenu.Item>

      <DropdownMenu.Separator className="my-1 h-px bg-gray-200" />
    </>
  );
}

export function ChatMoreMenu({
  muted,
  pinned,
  archived,
  blocked,
  theme,
  onViewCustomer,
  onOrderDetails,
  onSearch,
  onMedia,
  onMute,
  onPin,
  onArchive,
  onTheme,
  onExport,
  onBlock,
  onReport,
  onClear,
  onDelete,
}: Props) {
  const [panel, setPanel] = useState<Panel>('main');

  /*
   * Sub-panels are rendered in place of the main list rather than as Radix
   * sub-menus, so `preventDefault` is needed to keep the menu open while
   * swapping panels. Reset to the main panel whenever the menu closes.
   */
  const goTo = (next: Panel) => (event: Event) => {
    event.preventDefault();
    setPanel(next);
  };

  const goBack = goTo('main');

  return (
    <DropdownMenu.Root
      onOpenChange={(open) => {
        if (!open) setPanel('main');
      }}
    >
      <DropdownMenu.Trigger asChild>
        <button className="rounded-md p-2 transition hover:bg-gray-100" aria-label="More options">
          <MoreHorizontal className="size-5" />
        </button>
      </DropdownMenu.Trigger>

      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="end"
          sideOffset={8}
          className="z-50 min-w-[250px] rounded-2xl bg-white p-2 shadow-xl outline-none"
        >
          {panel === 'main' && (
            <>
              <DropdownMenu.Item onSelect={onViewCustomer} className="menu-item">
                <User size={18} />
                View Customer
              </DropdownMenu.Item>

              <DropdownMenu.Item onSelect={onOrderDetails} className="menu-item">
                <Package size={18} />
                Order Details
              </DropdownMenu.Item>

              <DropdownMenu.Item onSelect={onMedia} className="menu-item">
                <FolderOpen size={18} />
                Media & Files
              </DropdownMenu.Item>

              <DropdownMenu.Item onSelect={onSearch} className="menu-item">
                <Search size={18} />
                Search Conversation
              </DropdownMenu.Item>

              <DropdownMenu.Separator className="my-1 h-px bg-gray-200" />

              <DropdownMenu.Item onSelect={onMute} className="menu-item">
                {muted ? <Bell size={18} /> : <BellOff size={18} />}
                {muted ? 'Unmute Notifications' : 'Mute Notifications'}
              </DropdownMenu.Item>

              <DropdownMenu.Item onSelect={onPin} className="menu-item">
                {pinned ? <PinOff size={18} /> : <Pin size={18} />}
                {pinned ? 'Unpin Conversation' : 'Pin Conversation'}
              </DropdownMenu.Item>

              <DropdownMenu.Item onSelect={onArchive} className="menu-item">
                {archived ? <ArchiveRestore size={18} /> : <Archive size={18} />}
                {archived ? 'Unarchive Conversation' : 'Archive Conversation'}
              </DropdownMenu.Item>

              <DropdownMenu.Separator className="my-1 h-px bg-gray-200" />

              <DropdownMenu.Item className="menu-item" onSelect={goTo('theme')}>
                <Palette size={18} />
                Chat Theme
                <span className="text-muted ml-auto flex items-center gap-1.5 text-xs">
                  {CHAT_THEMES[theme].label}
                  <ChevronRight size={16} />
                </span>
              </DropdownMenu.Item>

              <DropdownMenu.Item className="menu-item" onSelect={goTo('export')}>
                <Download size={18} />
                Export Chat
                <ChevronRight size={16} className="ml-auto" />
              </DropdownMenu.Item>

              <DropdownMenu.Separator className="my-1 h-px bg-gray-200" />

              <DropdownMenu.Item className="menu-item" onSelect={goTo('more')}>
                More
                <ChevronRight size={16} className="ml-auto" />
              </DropdownMenu.Item>
            </>
          )}

          {panel === 'theme' && (
            <>
              <BackItem onBack={goBack} />

              {CHAT_THEME_ORDER.map((option) => (
                <DropdownMenu.Item
                  key={option}
                  className="menu-item"
                  onSelect={() => onTheme(option)}
                >
                  <span
                    className={cn(
                      'border-ink/15 size-4 shrink-0 rounded-full border',
                      CHAT_THEMES[option].swatch,
                    )}
                  />
                  {CHAT_THEMES[option].label}
                  {theme === option && <Check size={16} className="ml-auto" />}
                </DropdownMenu.Item>
              ))}
            </>
          )}

          {panel === 'export' && (
            <>
              <BackItem onBack={goBack} />

              <DropdownMenu.Item className="menu-item" onSelect={() => onExport('txt')}>
                <FileText size={18} />
                Plain text (.txt)
              </DropdownMenu.Item>

              <DropdownMenu.Item className="menu-item" onSelect={() => onExport('json')}>
                <FileJson size={18} />
                JSON (.json)
              </DropdownMenu.Item>
            </>
          )}

          {panel === 'more' && (
            <>
              <BackItem onBack={goBack} />

              <DropdownMenu.Item
                onSelect={onBlock}
                className={cn('menu-item', !blocked && 'text-red-500')}
              >
                {blocked ? <ShieldOff size={18} /> : <Shield size={18} />}
                {blocked ? 'Unblock Customer' : 'Block Customer'}
              </DropdownMenu.Item>

              <DropdownMenu.Item onSelect={onReport} className="menu-item">
                <Flag size={18} />
                Report Customer
              </DropdownMenu.Item>

              <DropdownMenu.Item onSelect={onClear} className="menu-item">
                <Eraser size={18} />
                Clear Conversation
              </DropdownMenu.Item>

              <DropdownMenu.Item onSelect={onDelete} className="menu-item text-red-500">
                <Trash2 size={18} />
                Delete Conversation
              </DropdownMenu.Item>
            </>
          )}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
