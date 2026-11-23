/**
 * EmojiPicker - the full picker: category tabs, search, frequently used, skin
 * tones, every emoji. Replaces a hand-picked grid of 32 that could not find
 * "goat" or a flag.
 *
 * WHY emoji-mart's CORE AND NOT @emoji-mart/react
 *   The React wrapper declares React 16-18 as its peer and this app is on 19,
 *   so installing it needs --legacy-peer-deps for everyone after. It is also
 *   only a dozen lines: construct `new Picker(...)` and append it. Doing that
 *   here costs the same and keeps the install clean.
 *
 * WHY IT IS LOADED ON OPEN
 *   The library plus the native emoji data is ~450KB. Most visitors never open
 *   the picker, and most are on phones with slow data, so neither is in the
 *   page bundle: both are dynamic imports that run the first time a picker
 *   mounts, then come from the module cache.
 *
 * `set: 'native'` draws the DEVICE's own emoji (Apple on iPhone, Fluent on
 * Windows, Noto on Android), so what you pick is what everyone else sees in
 * the post - an image set would show one style here and another in the feed.
 *
 * Colours are Sync's palette (see globals.css), passed as the RGB triplets
 * emoji-mart reads through its shadow DOM, and they follow the theme.
 */
'use client';

import { useEffect, useRef, useState } from 'react';
import { useThemeMode } from '@/hooks/use-theme-mode';
import { cn } from '@/lib/utils';

/* paper / forest / stone / lime-deep in light; the dark ramp in dark. */
const PALETTE = {
  light: {
    '--rgb-background': '242, 241, 234',
    '--rgb-color': '52, 78, 65',
    '--rgb-input': '218, 215, 205',
    '--rgb-accent': '68, 99, 63',
    '--color-border': 'rgba(52, 78, 65, 0.12)',
    '--color-border-over': 'rgba(52, 78, 65, 0.22)',
  },
  dark: {
    '--rgb-background': '32, 48, 39',
    '--rgb-color': '232, 230, 221',
    '--rgb-input': '20, 30, 24',
    '--rgb-accent': '163, 177, 138',
    '--color-border': 'rgba(232, 230, 221, 0.1)',
    '--color-border-over': 'rgba(232, 230, 221, 0.2)',
  },
} as const;

type Selected = { native: string };

export function EmojiPicker({
  onSelect,
  className,
}: {
  /** Called with the emoji character, skin tone already applied. */
  onSelect: (emoji: string) => void;
  className?: string;
}) {
  const host = useRef<HTMLDivElement>(null);
  const theme = useThemeMode();
  const [state, setState] = useState<'loading' | 'ready' | 'failed'>('loading');
  // The picker is built once per theme; the latest callback is read through a
  // ref so a parent re-render does not tear it down and lose the search box.
  const pick = useRef(onSelect);
  useEffect(() => {
    pick.current = onSelect;
  }, [onSelect]);

  useEffect(() => {
    let cancelled = false;
    let el: HTMLElement | null = null;

    Promise.all([import('emoji-mart'), import('@emoji-mart/data/sets/15/native.json')])
      .then(([{ Picker }, data]) => {
        if (cancelled || !host.current) return;
        el = new Picker({
          data: data.default ?? data,
          set: 'native',
          theme,
          autoFocus: true,
          previewPosition: 'none',
          skinTonePosition: 'search',
          maxFrequentRows: 1,
          perLine: 8,
          emojiSize: 22,
          emojiButtonSize: 34,
          onEmojiSelect: (e: Selected) => pick.current(e.native),
        }) as unknown as HTMLElement;
        // `host` is an element React renders EMPTY and never touches again, so
        // putting the picker inside it cannot collide with React's own nodes.
        host.current.replaceChildren(el);
        setState('ready');
      })
      .catch(() => {
        if (!cancelled) setState('failed');
      });

    return () => {
      cancelled = true;
      el?.remove();
    };
  }, [theme]);

  return (
    <div
      style={PALETTE[theme] as React.CSSProperties}
      className={cn(
        'relative overflow-hidden rounded-[20px]',
        '[--border-radius:20px] [--shadow:0_14px_36px_rgb(20_30_24/0.18)]',
        // Holds the picker's own size while it loads, so the popover does not
        // open as a sliver and then jump.
        state !== 'ready' && 'bg-paper flex min-h-95 min-w-79.5 items-center justify-center',
        className,
      )}
    >
      <div ref={host} />
      {state === 'loading' && (
        <span
          className="border-forest/20 border-t-forest size-6 animate-spin rounded-full border-2"
          aria-hidden="true"
        />
      )}
      {state === 'failed' && (
        <p className="text-moss p-4 text-center text-sm">
          Emoji did not load. Check your connection.
        </p>
      )}
    </div>
  );
}
