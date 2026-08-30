/**
 * Web app manifest, served by Next at /manifest.webmanifest.
 *
 * This is a Next file convention (app/manifest.ts) - Next links it into every
 * page's <head> automatically, so there is no <link rel="manifest"> to add.
 *
 * Installability needs all of: this manifest, a 192px and a 512px icon, and
 * HTTPS. Everything below is what the browser reads when the user chooses
 * "Add to Home Screen", so the values are user-visible, not internal config.
 */
import type { MetadataRoute } from 'next';
import { SITE } from '@/config/site';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: `${SITE.name} - ${SITE.tagline}`,
    // Home-screen label. Kept very short: iOS and Android truncate at roughly
    // 12 characters, and a clipped name looks broken next to native apps.
    short_name: SITE.name,
    description: SITE.summary,

    // Installed users land in the app, not the marketing page they installed
    // from. `?src=pwa` makes installed sessions separable in analytics.
    start_url: '/around?src=pwa',
    scope: '/',

    // 'standalone' is what removes browser chrome and makes it feel like an
    // app. Falls back to a normal tab on browsers that don't support it.
    display: 'standalone',
    orientation: 'portrait',

    // Matches --color-ink so the splash screen and status bar are continuous
    // with the app's dark shell instead of flashing white on launch.
    background_color: '#0e0e12',
    theme_color: '#0e0e12',

    categories: ['shopping', 'lifestyle', 'food'],
    lang: 'en-NG',
    dir: 'ltr',

    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      // 'maskable' lets Android crop to whatever shape the launcher uses
      // (circle, squircle, rounded square) without clipping the mark. Its art
      // is inset to the safe zone, so it must be a SEPARATE file from 'any' -
      // declaring one icon as both makes it look shrunken on some launchers.
      { src: '/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
