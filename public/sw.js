/* Sync service worker - deliberately minimal.
 *
 * Its job is (1) to satisfy Chromium's installability criteria so the install
 * prompt appears, and (2) to speed up repeat loads of immutable build assets.
 *
 * WHAT IT MUST NEVER DO: cache authenticated responses. Almost every route in
 * Sync is dynamic and per-user - bookings, wallet, messages. On a shared phone
 * a cached HTML document could serve one student's data to the next person to
 * open the app. So this only ever caches same-origin GET requests for
 * fingerprinted build output and our own icons, and passes everything else
 * straight to the network.
 */

const CACHE = 'sync-static-v1';

// Only paths that are immutable (content-hashed) or truly static.
const CACHEABLE = [/^\/_next\/static\//, /^\/icon-/, /^\/apple-touch-icon\.png$/, /^\/fonts?\//];

self.addEventListener('install', (event) => {
  // Take over as soon as the new worker is ready rather than waiting for every
  // tab to close - otherwise a deploy can leave users on a stale worker for days.
  event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(names.filter((n) => n !== CACHE).map((n) => caches.delete(n)));
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (!CACHEABLE.some((re) => re.test(url.pathname))) return;

  // Cache-first: these paths are content-hashed, so a hit is always correct.
  event.respondWith(
    (async () => {
      const hit = await caches.match(req);
      if (hit) return hit;

      const res = await fetch(req);
      // `basic` excludes opaque cross-origin responses, which we can't inspect.
      if (res.ok && res.type === 'basic') {
        const cache = await caches.open(CACHE);
        cache.put(req, res.clone());
      }
      return res;
    })(),
  );
});
