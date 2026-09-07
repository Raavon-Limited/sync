/**
 * useThemeMode - the theme the page is actually painted in, 'light' or 'dark'.
 *
 * WHY IT IS NOT JUST useMediaQuery('(prefers-color-scheme: dark)')
 *   ThemeToggle writes a `.dark` / `.light` class onto <html> and persists the
 *   choice; the OS preference is only the fallback when neither class is set
 *   (see the no-flash script in app/layout). Reading the media query alone
 *   would tell a user who has explicitly chosen light that the page is dark.
 *
 * WHY IT SUBSCRIBES TO BOTH
 *   The class changes without a re-render - the toggle mutates the DOM node
 *   directly, on purpose, so it never has to fight hydration. A MutationObserver
 *   on that one attribute is what turns the mutation back into React state, and
 *   the media query still matters for anyone who has never touched the toggle.
 *
 * The server snapshot is 'dark'. Something has to be assumed before there is a
 * DOM, and anything reading localStorage during the first client render is a
 * hydration mismatch by construction.
 */
'use client';

import { useSyncExternalStore } from 'react';

export type ThemeMode = 'light' | 'dark';

function read(): ThemeMode {
  const el = document.documentElement;
  if (el.classList.contains('dark')) return 'dark';
  if (el.classList.contains('light')) return 'light';
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function subscribe(onChange: () => void) {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });

  const mql = window.matchMedia('(prefers-color-scheme: dark)');
  mql.addEventListener('change', onChange);

  return () => {
    observer.disconnect();
    mql.removeEventListener('change', onChange);
  };
}

export function useThemeMode(): ThemeMode {
  return useSyncExternalStore(subscribe, read, () => 'dark' as const);
}
