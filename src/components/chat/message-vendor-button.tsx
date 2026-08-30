/**
 * "Message vendor" — the student-side entry point into messaging.
 *
 * THE MISSING LINK
 *   `useOpenListingConversation` and its RPC existed with no caller, which is
 *   why no student could start a thread: the whole chain was built and had no
 *   door. This is the door.
 *
 * WHY IT DOES NOT NAVIGATE
 *   The chat lives in a floating widget mounted once per shell, not on a route,
 *   so "go to the thread" is an event rather than a push. The mutation returns
 *   the conversation id and we hand it straight to the widget.
 *
 * The RPC is idempotent per (listing, caller), so a student who taps this twice
 * — or comes back a week later — re-enters the same thread instead of opening a
 * second one the vendor would see as a duplicate.
 */
'use client';

import { useState } from 'react';
import { MessageCircle, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useOpenListingConversation } from '@/modules/messaging/hooks';
import { openChat } from '@/lib/chat-events';

interface MessageVendorButtonProps {
  listingId: string;
  /** Rendered inside the button; defaults to a sensible label. */
  label?: string;
  className?: string;
  variant?: React.ComponentProps<typeof Button>['variant'];
}

export function MessageVendorButton({
  listingId,
  label = 'Message vendor',
  className,
  variant = 'outline',
}: MessageVendorButtonProps) {
  const open = useOpenListingConversation();
  const [error, setError] = useState<string | null>(null);

  function handleClick() {
    setError(null);
    open.mutate(listingId, {
      onSuccess: (conversationId) => openChat(conversationId),
      // The RPC raises for the cases the UI cannot know about in advance —
      // signed out, listing pulled, vendor tapping their own listing. Surface
      // the reason rather than a silent no-op.
      onError: (e: unknown) => setError(e instanceof Error ? e.message : 'Could not open chat'),
    });
  }

  return (
    <div className="flex flex-col gap-1">
      <Button
        type="button"
        variant={variant}
        className={className}
        onClick={handleClick}
        disabled={open.isPending}
      >
        {open.isPending ? (
          <Loader2 className="size-4 animate-spin" />
        ) : (
          <MessageCircle className="size-4" />
        )}
        {label}
      </Button>
      {error && <p className="text-coral text-xs">{error}</p>}
    </div>
  );
}
