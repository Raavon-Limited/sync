/**
 * Cross-component chat signals.
 *
 * A constant, not data - it lived in `src/mock/student.ts` only because that is
 * where it was first needed. The notification bell dispatches it and the chat
 * widget listens, and neither should have to import a mock file to do so.
 */

/** Dispatch on `window` to pop the floating chat open from anywhere. */
export const OPEN_CHAT_EVENT = 'sync:open-chat';

/**
 * Optional payload. Callers that already know which thread they want (the
 * "Message vendor" button, which just created one) pass its id; callers that
 * only want the panel open (the notification bell) pass nothing, and the widget
 * keeps whatever thread was last selected.
 */
export interface OpenChatDetail {
  conversationId?: string;
}

/** Typed dispatch helper, so call sites cannot misspell the detail shape. */
export function openChat(conversationId?: string) {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(
    new CustomEvent<OpenChatDetail>(OPEN_CHAT_EVENT, { detail: { conversationId } }),
  );
}
