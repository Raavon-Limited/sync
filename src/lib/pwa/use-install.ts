/**
 * PWA install detection.
 *
 * Answers two questions the gate needs: "is this already the installed app?"
 * and "can I offer a real install button, or only instructions?"
 *
 * The honest constraint this is built around: **iOS cannot be prompted.**
 * Safari implements no `beforeinstallprompt`, so on iPhone/iPad the only way in
 * is the user tapping Share -> Add to Home Screen themselves. Any UI here has to
 * degrade to instructions rather than a button, on that platform.
 */
'use client';

import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';

/** Chrome's install event. Not in lib.dom yet, so declared here. */
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

const STANDALONE_QUERY = '(display-mode: standalone)';

/**
 * Exported so callers can choose their own SSR default. useIsStandalone
 * assumes `true` on the server (so the install gate never blocks SSR HTML);
 * the boot splash needs the opposite assumption and builds its own store.
 */
export function readStandalone(): boolean {
  try {
    // `navigator.standalone` is the iOS-only legacy flag; iOS Safari does not
    // report display-mode reliably on older versions, so check both.
    const iosStandalone = (window.navigator as { standalone?: boolean }).standalone === true;
    return window.matchMedia(STANDALONE_QUERY).matches || iosStandalone;
  } catch {
    return false;
  }
}

export function subscribeStandalone(cb: () => void) {
  const mq = window.matchMedia(STANDALONE_QUERY);
  mq.addEventListener('change', cb);
  return () => mq.removeEventListener('change', cb);
}

/**
 * True when running as an installed app.
 *
 * The server snapshot is deliberately `true`: it means SSR renders the real
 * page, not the install wall. That keeps the HTML crawlable (a gate rendered
 * server-side would show search engines nothing but an install prompt) and
 * means an installed user never flashes the gate. A browser visitor sees one
 * frame of content before the gate replaces it - the correct trade.
 */
export function useIsStandalone(): boolean {
  return useSyncExternalStore(subscribeStandalone, readStandalone, () => true);
}

export type Platform = 'ios' | 'android' | 'desktop';

export function detectPlatform(): Platform {
  if (typeof navigator === 'undefined') return 'desktop';
  const ua = navigator.userAgent;
  // iPadOS 13+ reports as Macintosh; the touch-point check separates it from a
  // real Mac, which would otherwise get iOS instructions it can't follow.
  const isIpad = /Macintosh/.test(ua) && navigator.maxTouchPoints > 1;
  if (/iPad|iPhone|iPod/.test(ua) || isIpad) return 'ios';
  if (/Android/.test(ua)) return 'android';
  return 'desktop';
}

/** Never changes for the life of the tab, so subscribe is a no-op. */
const noopSubscribe = () => () => {};

export function usePlatform(): Platform {
  // Server snapshot is 'desktop' so SSR and the first client render agree;
  // useSyncExternalStore then swaps in the real value without a mismatch.
  return useSyncExternalStore(noopSubscribe, detectPlatform, () => 'desktop' as Platform);
}

export function useInstall() {
  const isStandalone = useIsStandalone();
  const platform = usePlatform();
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);

  useEffect(() => {
    // Chromium fires this instead of showing its own mini-infobar, but only
    // once installability criteria are met (manifest + HTTPS + icons). Holding
    // the event lets us trigger the real dialog from our own button later.
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
    };
    const onInstalled = () => {
      setInstalled(true);
      setDeferred(null);
    };

    window.addEventListener('beforeinstallprompt', onPrompt);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  const promptInstall = useCallback(async () => {
    if (!deferred) return false;
    await deferred.prompt();
    const { outcome } = await deferred.userChoice;
    // The event is single-use - Chrome will fire a fresh one if still eligible.
    setDeferred(null);
    return outcome === 'accepted';
  }, [deferred]);

  return {
    isStandalone,
    platform,
    installed,
    /** Non-null only where a real install dialog can be opened (Chromium). */
    canPrompt: deferred !== null,
    promptInstall,
  };
}
