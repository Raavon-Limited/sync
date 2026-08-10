import { ChatTheme } from '@/store/use-chat-store';

/**
 * Chat backgrounds offered by the "Chat Theme" menu entry.
 *
 * `surface` styles the scrolling message area, `bubble` the vendor's own
 * outgoing bubbles, and `swatch` the little preview dot in the menu.
 */
export const CHAT_THEMES: Record<
  ChatTheme,
  { label: string; surface: string; bubble: string; swatch: string }
> = {
  default: {
    label: 'Default',
    surface: 'bg-white',
    bubble: 'bg-violet-600 text-white',
    swatch: 'bg-white',
  },
  sand: {
    label: 'Sand',
    surface: 'bg-amber-50',
    bubble: 'bg-amber-600 text-white',
    swatch: 'bg-amber-200',
  },
  mint: {
    label: 'Mint',
    surface: 'bg-emerald-50',
    bubble: 'bg-emerald-600 text-white',
    swatch: 'bg-emerald-200',
  },
  dusk: {
    label: 'Dusk',
    surface: 'bg-slate-100',
    bubble: 'bg-slate-700 text-white',
    swatch: 'bg-slate-400',
  },
};

export const CHAT_THEME_ORDER: ChatTheme[] = ['default', 'sand', 'mint', 'dusk'];
