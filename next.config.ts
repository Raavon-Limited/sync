/**
 * Next config - applies security headers to every route. The CSP and full
 * header set live in `src/lib/security/headers.ts` so they can be reviewed
 * and tested independently.
 */
import type { NextConfig } from 'next';
import { securityHeaders } from './src/lib/security/headers';

const nextConfig: NextConfig = {
  /**
   * Build output directory, overridable per invocation.
   *
   * `next build` and `next dev` share `.next` by default, so running a build
   * while a dev server is up replaces the manifests the running server is
   * serving from. The dev client then fails mid-navigation with
   * "Failed to fetch" out of navigateToUnknownRoute, or 500s on a missing
   * .next/dev/routes-manifest.json - a confusing failure that has nothing to do
   * with the code being edited.
   *
   * Set NEXT_DIST_DIR to build somewhere else and leave the dev server alone:
   *
   *   NEXT_DIST_DIR=.next-verify npm run build
   *
   * Unset, everything behaves exactly as before, so CI and Vercel are
   * unaffected.
   *
   * CAVEAT: Next rewrites tsconfig.json's `include` to point at whatever dist
   * dir it just used. After building with an override, `git checkout
   * tsconfig.json` - committing `.next-verify/types` into the shared config
   * would break typechecking for everyone else, who do not have that folder.
   */
  distDir: process.env.NEXT_DIST_DIR || '.next',

  /**
   * /me kept alive, pointing at /user.
   *
   * The student dashboard moved from /me to /user, and the old path is not
   * only in bookmarks: it is in emails Sync has already sent, in the QR on
   * printed ID cards' verify links, and in every message where somebody shared
   * "check /me/wallet". A renamed route that 404s its own history is a rename
   * that costs the user more than it gains anybody.
   *
   * PERMANENT, so browsers and search engines stop asking. The pair is
   * deliberate: `/me/:path*` alone does not match the bare `/me`.
   */
  async redirects() {
    return [
      { source: '/me', destination: '/user', permanent: true },
      { source: '/me/:path*', destination: '/user/:path*', permanent: true },
    ];
  },

  async headers() {
    return [
      {
        // Match every route. The CSP itself scopes what's allowed per directive.
        source: '/:path*',
        headers: [...securityHeaders],
      },
      {
        // The service worker gets its own headers on top of the global set
        // (Next applies every matching entry, so these are additive).
        //
        // no-store is the important one: a cached sw.js is how a broken worker
        // survives a deploy and keeps serving stale assets to users who have no
        // obvious way to clear it.
        source: '/sw.js',
        headers: [
          { key: 'Content-Type', value: 'application/javascript; charset=utf-8' },
          { key: 'Cache-Control', value: 'no-cache, no-store, must-revalidate' },
          // Tighter than the site CSP: the worker only ever runs its own code.
          { key: 'Content-Security-Policy', value: "default-src 'self'; script-src 'self'" },
        ],
      },
    ];
  },
  images: {
    // Allow Supabase storage hosts for next/image. Replace `your-project` with
    // the actual project ref once the env is set.
    remotePatterns: [
      { protocol: 'https', hostname: '*.supabase.co' },
      { protocol: 'https', hostname: '*.supabase.in' },
      // Mock data uses Unsplash photos until Supabase Storage is wired.
      // TODO: remove this entry once mocks are replaced with real listings.
      { protocol: 'https', hostname: 'images.unsplash.com' },
    ],
  },
};

export default nextConfig;
