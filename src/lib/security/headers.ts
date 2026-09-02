/**
 * Security headers applied to every response.
 *
 * Mounted via `next.config.ts → headers()`. Tweak the CSP carefully: each
 * loosening should have a reason commented inline.
 *
 * Notes:
 *   - HSTS is only safe once HTTPS is fully deployed; do not add to dev hosts.
 *   - `frame-ancestors 'none'` is the modern equivalent of X-Frame-Options.
 *     We keep both for older browsers.
 *   - `'unsafe-inline'` is allowed for styles because Tailwind / next/font
 *     inject `<style>` tags during streaming. We do NOT allow it for scripts.
 */
const PAYSTACK_ORIGINS = 'https://js.paystack.co https://checkout.paystack.com';

// Allow Supabase storage + signed URLs for images, and Supabase realtime / REST.
const SUPABASE_ORIGINS = 'https://*.supabase.co https://*.supabase.in wss://*.supabase.co';

// Google Maps JavaScript API, which backs every interactive map in the app.
// Split by directive because the SDK pulls from four different origins:
//   - maps.googleapis.com  the loader script itself, plus every tile/data XHR
//   - maps.gstatic.com     sprites, control icons, the Google logo
//   - *.googleapis.com     tile subdomains for vector/raster imagery
//   - *.ggpht.com          Street View and place photography
// `blob:` in worker-src is NOT optional: vector maps rasterise in a blob-backed
// web worker, and without it the map renders as a blank grey box with only an
// opaque worker error in the console.
const GOOGLE_MAPS_SCRIPT = 'https://maps.googleapis.com';
const GOOGLE_MAPS_IMG = 'https://maps.gstatic.com https://*.googleapis.com https://*.ggpht.com';
// places.googleapis.com is a SEPARATE origin from maps.googleapis.com, and it
// is where the Places API (New) actually sends its requests - the address
// autocomplete in onboarding talks to it via the SDK. Without it here, CSP
// blocks every suggestion request; the field then falls back to a plain input
// and looks merely unhelpful rather than broken, which is a bad way to find out.
const GOOGLE_MAPS_CONNECT = 'https://maps.googleapis.com https://places.googleapis.com';
// The SDK injects a Google Fonts <link> for its own UI text.
const GOOGLE_FONTS_STYLE = 'https://fonts.googleapis.com';
const GOOGLE_FONTS_FONT = 'https://fonts.gstatic.com';

// Google Maps embed (event detail page's location preview iframe, using the
// `output=embed` query format). Scoped to https://www.google.com only   not
// a wildcard on *.google.com   since that's the single origin the embed
// iframe actually loads from. Without this, frame-src silently blocked the
// iframe before it ever requested anything, which is why the map rendered
// as permanently blank with no console error and onLoad never fired.
const GOOGLE_MAPS_EMBED_ORIGIN = 'https://www.google.com';

// React + Next dev tooling (HMR, error overlay, call-stack reconstruction)
// requires `eval()` in dev mode. Production never needs it.
//
// Two signals checked because this user's shell exports NODE_ENV=production:
//   1. NEXT_PHASE - set by Next itself ('phase-development-server' in dev,
//      'phase-production-build' / 'phase-production-server' otherwise).
//      Reliable regardless of shell env.
//   2. NODE_ENV - secondary fallback.
const nextPhase = process.env.NEXT_PHASE;
const isDev =
  nextPhase === 'phase-development-server' ||
  (nextPhase === undefined && process.env.NODE_ENV !== 'production');
const DEV_SCRIPT_RELAXATIONS = isDev ? `'unsafe-eval'` : '';

export const contentSecurityPolicy = [
  `default-src 'self'`,
  `script-src 'self' 'unsafe-inline' ${DEV_SCRIPT_RELAXATIONS} ${PAYSTACK_ORIGINS} ${GOOGLE_MAPS_SCRIPT}`,
  `style-src 'self' 'unsafe-inline' ${GOOGLE_FONTS_STYLE}`,
  `img-src 'self' data: blob: ${SUPABASE_ORIGINS} ${GOOGLE_MAPS_IMG}`,
  `font-src 'self' data: ${GOOGLE_FONTS_FONT}`,
  `connect-src 'self' ${SUPABASE_ORIGINS} ${PAYSTACK_ORIGINS} ${GOOGLE_MAPS_CONNECT}${isDev ? ' ws: http://localhost:* ws://localhost:*' : ''}`,
  `worker-src 'self' blob:`,
  `frame-src ${PAYSTACK_ORIGINS} ${GOOGLE_MAPS_EMBED_ORIGIN}`,
  `frame-ancestors 'none'`,
  `base-uri 'self'`,
  `form-action 'self' ${PAYSTACK_ORIGINS}`,
  `object-src 'none'`,
  `upgrade-insecure-requests`,
].join('; ');

export const securityHeaders = [
  { key: 'Content-Security-Policy', value: contentSecurityPolicy },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  {
    key: 'Permissions-Policy',
    value: 'camera=(), microphone=(), geolocation=(self), payment=(self)',
  },
  // HSTS only in production - never on localhost or it pins your browser.
  ...(process.env.NODE_ENV === 'production'
    ? [
      {
        key: 'Strict-Transport-Security',
        value: 'max-age=63072000; includeSubDomains; preload',
      },
    ]
    : []),
] as const;