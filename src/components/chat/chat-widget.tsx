/**
 * ChatWidget - a floating chat shown on every page (mounted once in the root
 * Providers). Collapsed it's a round button; open it's a panel with a
 * conversation list + message thread. Users can:
 *   - drag it anywhere (launcher, or the panel header),
 *   - resize the panel from its bottom-right corner.
 * Open/close, hover and new messages animate with framer-motion (respecting
 * reduced-motion).
 *
 * Backed by the messaging module: the conversation list and the open thread are
 * both live over Supabase Realtime. The widget mounts once in the root
 * Providers, so its channels are one per session rather than one per page.
 */
'use client';

import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { ChevronLeft, MessageCircle, Send, X } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { cn } from '@/lib/utils';
import { OPEN_CHAT_EVENT, type OpenChatDetail } from '@/lib/chat-events';
import { formatRelative } from '@/lib/utils';
import {
  useConversations,
  useConversationsRealtime,
  useConversationRealtime,
  useMessages,
  useSendMessage,
  useMarkConversationRead,
  useUnreadCounts,
} from '@/modules/messaging/hooks';

const DRAG_THRESHOLD = 4; // px before a press counts as a drag, not a click
const DEFAULT_SIZE = { w: 420, h: 600 };
const MIN_SIZE = { w: 320, h: 440 };
const MARGIN = 12;

const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), hi);

export function ChatWidget() {
  const reduce = useReducedMotion();
  const [open, setOpen] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);
  // Separate positions (top-left; null = anchored bottom-right) so closing the
  // panel returns the launcher to ITS own last spot, not wherever the open
  // panel was dragged.
  const [launcherPos, setLauncherPos] = useState<{ x: number; y: number } | null>(null);
  const [panelPos, setPanelPos] = useState<{ x: number; y: number } | null>(null);
  const [size, setSize] = useState(DEFAULT_SIZE);

  const containerRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{
    sx: number;
    sy: number;
    ox: number;
    oy: number;
    moved: boolean;
    launcher: boolean;
  } | null>(null);
  const resize = useRef<{
    sx: number;
    sy: number;
    sw: number;
    sh: number;
    sLeft: number;
    sTop: number;
  } | null>(null);

  // Open the chat when a "message" notification (or anything) fires the event.
  // A caller that already knows its thread (the "Message vendor" button, which
  // just created one) passes an id and lands directly in it; the bell passes
  // nothing and the last selected thread stays put.
  useEffect(() => {
    const onOpen = (e: Event) => {
      const id = (e as CustomEvent<OpenChatDetail>).detail?.conversationId;
      if (id) setActiveId(id);
      setOpen(true);
    };
    window.addEventListener(OPEN_CHAT_EVENT, onOpen);
    return () => window.removeEventListener(OPEN_CHAT_EVENT, onOpen);
  }, []);

  // The list drives the panel; the count comes from the RPC so it stays right
  // even when the widget is holding only the first page of threads.
  useConversationsRealtime();
  const { data: conversations = [] } = useConversations({ pageSize: 30 });
  const { data: counts } = useUnreadCounts();

  const totalUnread = counts?.messages ?? 0;
  const activeContact = conversations.find((c) => c.id === activeId) ?? null;
  const spring = reduce
    ? { duration: 0 }
    : { type: 'spring' as const, stiffness: 380, damping: 32 };

  // ── Drag (move) ──────────────────────────────────────────────────────────
  function onDragDown(e: React.PointerEvent, launcher: boolean) {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    drag.current = {
      sx: e.clientX,
      sy: e.clientY,
      ox: rect.left,
      oy: rect.top,
      moved: false,
      launcher,
    };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }
  function onDragMove(e: React.PointerEvent) {
    const d = drag.current;
    if (!d) return;
    const dx = e.clientX - d.sx;
    const dy = e.clientY - d.sy;
    if (!d.moved && Math.abs(dx) + Math.abs(dy) > DRAG_THRESHOLD) d.moved = true;
    if (d.moved) {
      const w = containerRef.current?.offsetWidth ?? 0;
      const h = containerRef.current?.offsetHeight ?? 0;
      const next = {
        x: clamp(d.ox + dx, MARGIN, window.innerWidth - w - MARGIN),
        y: clamp(d.oy + dy, MARGIN, window.innerHeight - h - MARGIN),
      };
      (d.launcher ? setLauncherPos : setPanelPos)(next);
    }
  }
  function onDragUp(e: React.PointerEvent) {
    const d = drag.current;
    drag.current = null;
    (e.target as HTMLElement).releasePointerCapture?.(e.pointerId);
    if (d?.launcher && !d.moved) setOpen(true);
  }

  // ── Resize (top-right handle) ──────────────────────────────────────────────
  // Left + bottom edges stay put; dragging grows width (right) and height (top).
  function onResizeDown(e: React.PointerEvent) {
    e.stopPropagation();
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    // Pin to explicit top-left coords so the math is anchor-independent.
    setPanelPos({ x: rect.left, y: rect.top });
    resize.current = {
      sx: e.clientX,
      sy: e.clientY,
      sw: size.w,
      sh: size.h,
      sLeft: rect.left,
      sTop: rect.top,
    };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }
  function onResizeMove(e: React.PointerEvent) {
    const r = resize.current;
    if (!r) return;
    const dx = e.clientX - r.sx;
    const dy = e.clientY - r.sy;
    const w = clamp(r.sw + dx, MIN_SIZE.w, window.innerWidth - r.sLeft - MARGIN);
    const maxH = r.sTop + r.sh - MARGIN; // top can't pass the viewport margin
    const h = clamp(r.sh - dy, MIN_SIZE.h, maxH);
    setSize({ w, h });
    setPanelPos({ x: r.sLeft, y: r.sTop + r.sh - h }); // keep the bottom edge fixed
  }
  function onResizeUp(e: React.PointerEvent) {
    resize.current = null;
    (e.target as HTMLElement).releasePointerCapture?.(e.pointerId);
  }

  // Keep the panel/launcher on-screen given current size.
  function styleFor(
    p: { x: number; y: number } | null,
    w: number,
    h: number,
  ): React.CSSProperties | undefined {
    if (p === null) return undefined;
    return {
      left: clamp(p.x, MARGIN, window.innerWidth - w - MARGIN),
      top: clamp(p.y, MARGIN, window.innerHeight - h - MARGIN),
    };
  }

  const vw = typeof window !== 'undefined' ? window.innerWidth : 1280;
  const vh = typeof window !== 'undefined' ? window.innerHeight : 800;
  const panelW = Math.min(size.w, vw - 2 * MARGIN);
  const panelH = Math.min(size.h, vh - 2 * MARGIN);
  const anchored = open ? panelPos === null : launcherPos === null;

  return (
    <div
      ref={containerRef}
      className={cn('fixed z-60 touch-none', anchored && 'right-6 bottom-6')}
      style={open ? styleFor(panelPos, panelW, panelH) : styleFor(launcherPos, 56, 56)}
    >
      <AnimatePresence mode="wait" initial={false}>
        {open ? (
          <motion.div
            key="panel"
            initial={{ opacity: 0, scale: 0.9, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 12 }}
            transition={spring}
            style={{ width: panelW, height: panelH, transformOrigin: 'bottom right' }}
            className="border-line/10 bg-panel relative flex flex-col overflow-hidden rounded-2xl border shadow-2xl"
          >
            {/* Header = drag handle */}
            <div
              onPointerDown={(e) => onDragDown(e, false)}
              onPointerMove={onDragMove}
              onPointerUp={onDragUp}
              className="border-line/10 flex cursor-grab items-center gap-2 border-b py-3 pr-10 pl-3 active:cursor-grabbing"
            >
              {activeContact ? (
                <button
                  type="button"
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={() => setActiveId(null)}
                  aria-label="Back to conversations"
                  className="text-content hover:bg-ink/5 -ml-1 inline-flex size-7 items-center justify-center rounded-full"
                >
                  <ChevronLeft className="size-4" />
                </button>
              ) : (
                <MessageCircle className="text-accent-fg size-4" />
              )}
              <p className="text-content flex-1 truncate text-sm font-medium">
                {activeContact ? activeContact.title : 'Messages'}
              </p>
              <button
                type="button"
                onPointerDown={(e) => e.stopPropagation()}
                onClick={() => setOpen(false)}
                aria-label="Close chat"
                className="text-content hover:bg-ink/5 inline-flex size-7 items-center justify-center rounded-full"
              >
                <X className="size-4" />
              </button>
            </div>

            {activeContact ? (
              <Thread key={activeContact.id} contactId={activeContact.id} reduce={!!reduce} />
            ) : (
              <ConversationList onSelect={setActiveId} />
            )}

            {/* Resize handle pinned to the top-right corner - drag to resize */}
            <div
              onPointerDown={onResizeDown}
              onPointerMove={onResizeMove}
              onPointerUp={onResizeUp}
              aria-label="Resize chat"
              title="Drag to resize"
              role="separator"
              className="group absolute top-0 right-0 z-30 flex size-8 cursor-nesw-resize touch-none items-start justify-end p-2"
            >
              <svg
                viewBox="0 0 12 12"
                aria-hidden="true"
                className="text-content-muted group-hover:text-accent-fg size-3.5 rotate-90 transition-colors"
              >
                <path
                  d="M11 4 L4 11 M11 8 L8 11"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                />
              </svg>
            </div>
          </motion.div>
        ) : (
          <motion.button
            key="launcher"
            type="button"
            aria-label="Open chat"
            onPointerDown={(e) => onDragDown(e, true)}
            onPointerMove={onDragMove}
            onPointerUp={onDragUp}
            initial={{ opacity: 0, scale: 0.6 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.6 }}
            whileHover={reduce ? undefined : { scale: 1.06 }}
            whileTap={reduce ? undefined : { scale: 0.92 }}
            transition={spring}
            className="bg-ink text-cream relative flex size-14 cursor-grab items-center justify-center rounded-full shadow-xl active:cursor-grabbing"
          >
            <MessageCircle className="size-6" />
            {totalUnread > 0 && (
              <span className="bg-coral text-cream absolute -top-1 -right-1 flex size-5 items-center justify-center rounded-full text-[11px] font-semibold">
                {totalUnread}
              </span>
            )}
          </motion.button>
        )}
      </AnimatePresence>
    </div>
  );
}

function ConversationList({ onSelect }: { onSelect: (id: string) => void }) {
  const { data: conversations = [], isLoading } = useConversations({ pageSize: 30 });

  if (isLoading) {
    return (
      <div className="flex-1 space-y-2 p-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="bg-ink/5 h-14 animate-pulse rounded-xl" />
        ))}
      </div>
    );
  }

  if (conversations.length === 0) {
    return (
      <div className="text-content-muted flex-1 px-6 py-10 text-center text-sm">
        No conversations yet. Messages about your orders and bookings show up here.
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto">
      {conversations.map((c) => (
        <button
          key={c.id}
          type="button"
          onClick={() => onSelect(c.id)}
          className="hover:bg-ink/5 flex w-full items-center gap-3 px-3 py-3 text-left transition-colors"
        >
          <div className="relative shrink-0">
            <Avatar className="size-10">
              {c.avatarUrl && <AvatarImage src={c.avatarUrl} alt="" />}
              <AvatarFallback>{c.title.charAt(0)}</AvatarFallback>
            </Avatar>
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between gap-2">
              <p className="text-content truncate text-sm font-medium">{c.title}</p>
              <span className="text-content-muted shrink-0 text-[11px]">
                {formatRelative(c.lastMessageAt)}
              </span>
            </div>
            <p className="text-content-muted truncate text-xs">{c.lastMessagePreview ?? ''}</p>
          </div>
          {!!c.unreadCount && (
            <span className="bg-coral text-cream flex size-5 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold">
              {c.unreadCount}
            </span>
          )}
        </button>
      ))}
    </div>
  );
}

function Thread({ contactId, reduce }: { contactId: string; reduce: boolean }) {
  const [draft, setDraft] = useState('');

  useConversationRealtime(contactId);
  const { data: messages = [], isLoading } = useMessages(contactId);
  const send = useSendMessage(contactId);
  const markRead = useMarkConversationRead();

  // Opening a thread clears its unread count. Keyed on the id so switching
  // threads re-runs it.
  useEffect(() => {
    markRead.mutate(contactId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contactId]);

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();

    const content = draft.trim();

    if (!content) return;

    // Clear immediately: the mutation is optimistic, so the bubble is already
    // on screen and a lingering draft would read as "not sent".
    setDraft('');
    send.mutate({ body: content });
  }

  return (
    <>
      <div className="flex flex-1 flex-col gap-2 overflow-y-auto p-3">
        {isLoading && <p className="text-content-muted p-4 text-center text-xs">Loading...</p>}

        {!isLoading && messages.length === 0 && (
          <p className="text-content-muted p-4 text-center text-xs">
            No messages yet. Say hello.
          </p>
        )}

        {messages.map((m) => (
          <motion.div
            key={m.id}
            initial={reduce ? false : { opacity: 0, y: 8, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={reduce ? { duration: 0 } : { type: 'spring', stiffness: 500, damping: 34 }}
            className={cn(
              'max-w-[80%] rounded-2xl px-3 py-2 text-sm',
              // `isMine` is resolved against the viewer, so this widget works
              // unchanged for students, vendors, landlords and riders alike.
              m.isMine
                ? 'bg-ink text-cream self-end rounded-br-sm'
                : 'bg-ink/5 text-content self-start rounded-bl-sm',
              m.id.startsWith('pending-') && 'opacity-60',
            )}
          >
            {m.isDeleted ? (
              <span className="italic opacity-70">Message deleted</span>
            ) : (
              (m.body ?? '')
            )}
          </motion.div>
        ))}
      </div>
      <form onSubmit={onSubmit} className="border-line/10 flex items-center gap-2 border-t p-2">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Type a message..."
          className="text-content placeholder:text-content-muted h-9 flex-1 rounded-full bg-transparent px-3 text-sm focus:outline-none"
        />
        <button
          type="submit"
          aria-label="Send"
          className="bg-ink text-cream inline-flex size-9 shrink-0 items-center justify-center rounded-full disabled:opacity-40"
          disabled={!draft.trim()}
        >
          <Send className="size-4" />
        </button>
      </form>
    </>
  );
}
