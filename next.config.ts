/**
 * Next config - applies security headers to every route. The CSP and full
 * header set live in `src/lib/security/headers.ts` so they can be reviewed
 * and tested independently.
 */
import type { NextConfig } from 'next';
import { securityHeaders } from './src/lib/security/headers';

const nextConfig: NextConfig = {
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
