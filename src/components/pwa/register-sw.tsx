/**
 * Registers the service worker. Renders nothing.
 *
 * Registration is deferred to the `load` event so it never competes with the
 * first paint for bandwidth - the worker is a progressive enhancement, not
 * something any first visit depends on.
 */
'use client';

import { useEffect } from 'react';

export function RegisterSW() {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;

    // PRODUCTION ONLY. sw.js caches /_next/static cache-first, and in dev those
    // chunk URLs change on every edit - a registered worker then serves stale
    // JavaScript and Next fails with "module factory is not available", which
    // looks like a compiler bug rather than a caching one. PWA behaviour is
    // tested against a production build anyway.
    if (process.env.NODE_ENV !== 'production') {
      // Actively tear down anything registered by an earlier dev session -
      // simply not registering would leave the existing worker in control,
      // and the developer would have to know to clear it by hand.
      void navigator.serviceWorker.getRegistrations().then((regs) => {
        regs.forEach((r) => void r.unregister());
      });
      if ('caches' in window) {
        void caches.keys().then((keys) => keys.forEach((k) => void caches.delete(k)));
      }
      return;
    }
    // Service workers need a secure context. localhost counts; plain-HTTP
    // staging does not, and registering there throws.
    if (!window.isSecureContext) return;

    const register = () => {
      navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => {
        // A failed registration must never break the page - the app works
        // perfectly well without a worker.
      });
    };

    if (document.readyState === 'complete') register();
    else window.addEventListener('load', register, { once: true });
    return () => window.removeEventListener('load', register);
  }, []);

  return null;
}
