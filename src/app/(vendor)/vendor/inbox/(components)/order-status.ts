/**
 * How an order's status is coloured, everywhere in the inbox.
 *
 * IT WAS FOUR COPIES
 *   chat-window, chat-panel, chat-order-dialog and chat-customer-dialog each
 *   declared their own map, and they had already drifted: amber-500 in one,
 *   amber-600 in another, amber-100/amber-700 in the two that draw a pill. Four
 *   copies of a colour decision is four places to forget when the theme
 *   changes, which is exactly what happened   they were all light-mode hues on
 *   a white panel, and unreadable the moment the page went dark.
 *
 * WHY THESE COLOURS
 *   Sync has one accent and one alarm, so the scale is read rather than
 *   invented: nothing has happened yet (quiet), it is moving (quiet, but the
 *   text steps up), it is done (lime, which is what this product says "good"
 *   in), it was cancelled (coral, the one warning colour).
 *
 *   `accent-fg` and `warning-fg` are the THEME-AWARE ends of those two ramps -
 *   lime-deep on cream, bright lime on ink; coral-deep on cream, coral on ink.
 *   Writing `text-coral` here instead would put a pastel on the light theme and
 *   make "Cancelled" quieter than "Pending".
 */
import type { ChatOrder } from '@/modules/vendor/types';

/** A filled pill, for where the status stands on its own. */
export const ORDER_STATUS_PILL: Record<ChatOrder['status'], string> = {
  Pending: 'bg-line/10 text-content-muted',
  Processing: 'bg-line/15 text-content',
  Completed: 'bg-accent/15 text-accent-fg',
  Cancelled: 'bg-warning/15 text-warning-fg',
};

/** Bare text, for where it sits inside a row that already has a background. */
export const ORDER_STATUS_TEXT: Record<ChatOrder['status'], string> = {
  Pending: 'text-content-muted',
  Processing: 'text-content',
  Completed: 'text-accent-fg',
  Cancelled: 'text-warning-fg',
};
