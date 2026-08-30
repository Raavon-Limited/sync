/**
 * Student inbox — conversation list, thread, composer.
 *
 * WHY IT DOES NOT REUSE THE FLOATING WIDGET
 *   `ChatWidget` is a draggable overlay with its own position and size state;
 *   its list and thread are internal to it. This is a route, and it should be
 *   a two-pane layout on desktop and a stack on mobile. The shared part is the
 *   messaging module underneath — both read the same hooks, so a message sent
 *   here appears there without either knowing about the other.
 *
 * REALTIME IS AN INVALIDATION SIGNAL, NOT A CACHE WRITE
 *   `useConversationRealtime` tells React Query something changed and lets the
 *   normal query refetch. A postgres_changes payload is a single flat row with
 *   none of its joins — splicing one into a fully-joined cache entry is how
 *   "the attachment disappeared" bugs happen.
 */
'use client';

import { useEffect, useRef, useState } from 'react';
import { MessageCircle, Send, ArrowLeft, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui';
import { formatRelative } from '@/lib/utils';
import {
  useConversations,
  useConversationsRealtime,
  useConversationRealtime,
  useMessages,
  useSendMessage,
  useMarkConversationRead,
} from '@/modules/messaging/hooks';
import { useSession } from '@/providers/session-provider';

/** A thread's subject, in words. Students see many kinds of thread now. */
const KIND_LABEL: Record<string, string> = {
  order: 'Order',
  listing: 'Listing',
  booking: 'Booking',
  hostel: 'Hostel',
  service_request: 'Service',
  delivery: 'Delivery',
  direct: 'Direct',
  support: 'Support',
};

export function MessagesPanel() {
  const { isAuthenticated } = useSession();
  useConversationsRealtime();
  const { data: conversations = [], isLoading } = useConversations({ pageSize: 50 });
  const [activeId, setActiveId] = useState<string | null>(null);

  // Land on the most recent thread on desktop; mobile starts on the list so the
  // student is not dropped into a conversation they did not pick.
  useEffect(() => {
    if (!activeId && conversations.length && window.innerWidth >= 768) {
      setActiveId(conversations[0].id);
    }
  }, [conversations, activeId]);

  if (!isAuthenticated) {
    return <p className="text-content-muted text-sm">Sign in to see your messages.</p>;
  }

  const active = conversations.find((c) => c.id === activeId) ?? null;

  return (
    <div className="border-line/10 bg-panel grid min-h-[32rem] overflow-hidden rounded-2xl border md:grid-cols-[20rem_1fr]">
      {/* List */}
      <aside
        className={`border-line/10 flex flex-col md:border-r ${active ? 'hidden md:flex' : 'flex'}`}
      >
        {isLoading && (
          <div className="flex flex-col gap-2 p-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="bg-ink/5 h-14 animate-pulse rounded-xl" />
            ))}
          </div>
        )}

        {!isLoading && conversations.length === 0 && (
          <div className="text-content-muted flex flex-1 flex-col items-center justify-center gap-2 p-6 text-center">
            <MessageCircle className="size-8 opacity-40" strokeWidth={1.5} />
            <p className="text-sm">No conversations yet.</p>
            <p className="text-xs">
              Message a vendor from a listing, or a landlord from a hostel, and it will appear here.
            </p>
          </div>
        )}

        <ul className="divide-line/5 flex-1 divide-y overflow-y-auto">
          {conversations.map((c) => (
            <li key={c.id}>
              <button
                type="button"
                onClick={() => setActiveId(c.id)}
                className={`hover:bg-ink/5 flex w-full items-start gap-3 p-3 text-left transition-colors ${
                  c.id === activeId ? 'bg-ink/5' : ''
                }`}
              >
                <span className="bg-lime/15 text-lime-deep mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-full text-xs font-semibold">
                  {(c.title ?? '?').slice(0, 1).toUpperCase()}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-baseline justify-between gap-2">
                    <span className="text-content truncate text-sm font-medium">{c.title}</span>
                    <span className="text-content-muted shrink-0 text-[10px]">
                      {c.lastMessageAt ? formatRelative(c.lastMessageAt) : ''}
                    </span>
                  </span>
                  <span className="text-content-muted block truncate text-xs">
                    {c.lastMessagePreview ?? 'No messages yet'}
                  </span>
                  <span className="text-content-muted mt-0.5 flex items-center gap-1 text-[10px] uppercase">
                    {KIND_LABEL[c.kind] ?? c.kind}
                  </span>
                </span>
                {c.hasUnread && <span className="bg-lime mt-2 size-2 shrink-0 rounded-full" />}
              </button>
            </li>
          ))}
        </ul>
      </aside>

      {/* Thread */}
      <section className={`flex flex-col ${active ? 'flex' : 'hidden md:flex'}`}>
        {active ? (
          <Thread
            key={active.id}
            conversationId={active.id}
            title={active.title}
            subtitle={KIND_LABEL[active.kind] ?? active.kind}
            onBack={() => setActiveId(null)}
          />
        ) : (
          <div className="text-content-muted flex flex-1 items-center justify-center p-6 text-sm">
            Pick a conversation to read it.
          </div>
        )}
      </section>
    </div>
  );
}

function Thread({
  conversationId,
  title,
  subtitle,
  onBack,
}: {
  conversationId: string;
  title: string;
  subtitle: string;
  onBack: () => void;
}) {
  const [draft, setDraft] = useState('');
  useConversationRealtime(conversationId);
  const { data: messages = [], isLoading } = useMessages(conversationId);
  const send = useSendMessage(conversationId);
  const markRead = useMarkConversationRead();
  const endRef = useRef<HTMLDivElement | null>(null);

  // Opening a thread is what marks it read — not merely having it selected.
  useEffect(() => {
    markRead.mutate(conversationId);
    // markRead is a stable mutation object; re-running on it would loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationId]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' });
  }, [messages.length]);

  return (
    <>
      <header className="border-line/10 flex items-center gap-2 border-b p-3">
        <button
          type="button"
          onClick={onBack}
          className="text-content-muted hover:text-content md:hidden"
          aria-label="Back to conversations"
        >
          <ArrowLeft className="size-4" />
        </button>
        <div className="min-w-0">
          <p className="text-content truncate text-sm font-medium">{title}</p>
          <p className="text-content-muted text-[11px] uppercase">{subtitle}</p>
        </div>
      </header>

      <div className="flex-1 space-y-2 overflow-y-auto p-3">
        {isLoading &&
          Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="bg-ink/5 h-10 w-2/3 animate-pulse rounded-xl" />
          ))}

        {!isLoading && messages.length === 0 && (
          <p className="text-content-muted py-8 text-center text-sm">
            No messages yet — say hello.
          </p>
        )}

        {messages.map((m) => (
          <div key={m.id} className={`flex ${m.isMine ? 'justify-end' : 'justify-start'}`}>
            <div
              className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm ${
                m.isMine ? 'bg-lime-deep text-white' : 'bg-surface-deep text-content'
              }`}
            >
              {/* A deleted message keeps its row so the thread still reads. */}
              {m.isDeleted ? (
                <span className="italic opacity-70">This message was deleted</span>
              ) : (
                m.body
              )}
              <span
                className={`mt-1 block text-[10px] ${m.isMine ? 'text-white/60' : 'text-content-muted'}`}
              >
                {formatRelative(m.createdAt)}
              </span>
            </div>
          </div>
        ))}
        <div ref={endRef} />
      </div>

      <form
        className="border-line/10 flex items-center gap-2 border-t p-3"
        onSubmit={(ev) => {
          ev.preventDefault();
          const body = draft.trim();
          if (!body) return;
          // Cleared immediately: the send is optimistic in the hook, and a
          // composer that waits for the server feels broken on campus wifi.
          setDraft('');
          send.mutate({ body });
        }}
      >
        <input
          value={draft}
          onChange={(ev) => setDraft(ev.target.value)}
          placeholder="Write a message…"
          className="border-line/10 bg-surface-deep text-content placeholder:text-content-muted min-w-0 flex-1 rounded-xl border px-3 py-2 text-sm outline-none"
        />
        <Button type="submit" disabled={!draft.trim() || send.isPending} className="shrink-0 gap-1">
          {send.isPending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
          Send
        </Button>
      </form>
    </>
  );
}
