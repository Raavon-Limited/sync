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
