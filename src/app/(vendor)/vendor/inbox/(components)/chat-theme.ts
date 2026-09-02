import { ChatTheme } from '@/store/use-chat-store';

/**
 * Chat backgrounds offered by the "Chat Theme" menu entry.
 *
 * `surface` styles the scrolling message area, `bubble` the vendor's own
 * outgoing bubbles, and `swatch` the little preview dot in the menu.
 *
 * EVERY VALUE IS A THEME-AWARE TOKEN, WHICH IT HAD TO BECOME
 *   These were fixed light hues - white, amber-50, emerald-50, slate-100 - with
 *   solid mid-tone bubbles on top. That is a set of four choices about what
 *   looks good on a WHITE panel, and the inbox is no longer always white: in
 *   dark mode the message area stayed pale and glowed out of the page, and
 *   "Dusk", of all of them, was the brightest thing on the screen.
 *
 *   So the four are now four positions in Sync's own palette, and each one
 *   flips with the theme. That is also why they are token names and not hex:
 *   the CSS resolves per theme, and nothing here has to know which one is on.
 *
 * WHY THE BUBBLE TEXT COLOURS LOOK INVERTED
 *   `bg-accent-fg text-panel` and `bg-content text-surface` are pairs that swap
 *   TOGETHER: in light, accent-fg is lime-deep and panel is white; in dark it is
 *   bright lime and near-black. Naming the pair rather than a literal is what
 *   keeps the bubble legible in both, instead of white-on-lime in one of them.
 *
 * The bright brand `lime` is used as a FILL only (`bg-accent`), never as bubble
 * text - the rule stated at the top of globals.css.
 */
export const CHAT_THEMES: Record<
  ChatTheme,
  { label: string; surface: string; bubble: string; swatch: string }
> = {
  /** The panel the rest of the inbox is made of. */
  default: {
    label: 'Default',
    surface: 'bg-panel',
    bubble: 'bg-accent text-ink',
    swatch: 'bg-accent',
  },
  /** The page's own sunken tone - warmer than the panel in both themes. */
  sand: {
    label: 'Sand',
    surface: 'bg-surface-deep',
    bubble: 'bg-warning text-ink',
    swatch: 'bg-warning',
  },
  /** A wash of the accent, for somebody who wants the lime turned up. */
  mint: {
    label: 'Mint',
    surface: 'bg-accent/5',
    bubble: 'bg-accent-fg text-panel',
    swatch: 'bg-accent-fg',
  },
  /** The page ground itself: the quietest of the four, dark when the page is. */
  dusk: {
    label: 'Dusk',
    surface: 'bg-surface',
    bubble: 'bg-content text-surface',
    swatch: 'bg-content',
  },
};

export const CHAT_THEME_ORDER: ChatTheme[] = ['default', 'sand', 'mint', 'dusk'];
