/**
 * Root layout for the entire Sync app.
 *
 * - Loads the three brand fonts (Bricolage Grotesque, Inter, JetBrains Mono)
 *   via next/font/google. Next still self-hosts and inlines them at build
 *   time, so no external request is made at runtime.
 * - Exposes each font as a CSS variable consumed by `globals.css` →
 *   `--font-display | --font-body | --font-mono`.
 * - Every route group ((marketing) / (auth) / (app) / (vendor) / (admin))
 *   gets its own nested layout that adds its specific shell on top of this.
 */
import type { Metadata, Viewport } from 'next';
import { Bricolage_Grotesque, Inter, JetBrains_Mono } from 'next/font/google';
import './globals.css';
import { Providers } from '@/providers';
import { listAreas } from '@/modules/areas/queries';
import { getCurrentUser } from '@/modules/auth/queries';
import { BootSplash } from '@/components/layouts/boot-splash';
import { SmoothScroll } from '@/components/layouts/smooth-scroll';
import { RegisterSW } from '@/components/pwa/register-sw';
import { Cursor } from '@/components/ui/cursor';

const bricolage = Bricolage_Grotesque({
  variable: '--font-bricolage',
  subsets: ['latin'],
  display: 'swap',
});

const inter = Inter({
  variable: '--font-inter',
  subsets: ['latin'],
  display: 'swap',
});

const jetbrainsMono = JetBrains_Mono({
  variable: '--font-jetbrains-mono',
  subsets: ['latin'],
  display: 'swap',
});

export const metadata: Metadata = {
  title: {
    default: 'Sync - your campus, in one app',
    template: '%s · Sync',
  },
  description:
    'Sync is the verified marketplace for Nigerian student life - hostels, food, events, beauty, trades, laundry and more, all in one place.',

  // iOS ignores the manifest's icons for the home screen and reads this instead.
  icons: { apple: '/apple-touch-icon.png' },
  appleWebApp: {
    // Makes an iOS home-screen launch open without Safari chrome, the same way
    // display:'standalone' does on Android.
    capable: true,
    title: 'Sync',
    // 'default' keeps the status bar readable on the dark shell. 'black-translucent'
    // would let content slide under the notch.
    statusBarStyle: 'default',
  },
};

/**
 * Viewport is a SEPARATE export in the App Router - a themeColor set inside
 * the `metadata` export is ignored (and warns at build time).
 *
 * themeColor tints the Android status bar and the iOS home-screen splash to
 * match --color-ink, so launching the installed app doesn't flash white.
 * viewportFit:'cover' plus the safe-area insets the layout already uses is what
 * keeps the bottom tab bar clear of the iPhone home indicator.
 */
export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f4f1e8' },
    { media: '(prefers-color-scheme: dark)', color: '#0e0e12' },
  ],
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Fetched here, not in each shell, so the single root LocationProvider has the
  // real list on first paint. listAreas() is React-cached (one query per
  // request) and falls back to the built-in list if Supabase is unreachable.
  // Both reads are independent, so fire them together. `user` MUST come from
  // the server: the browser's Supabase client does not learn about a
  // server-action sign-in, so anything asking the client first paints as
  // signed-out. It seeds SessionProvider (so no screen contradicts the header).
  const [areas, user] = await Promise.all([listAreas(), getCurrentUser()]);

  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${bricolage.variable} ${inter.variable} ${jetbrainsMono.variable} h-full antialiased`}
    >
      <head>
        {/* No-flash theme: apply the stored choice before first paint.
            No stored value → follow the OS (prefers-color-scheme). */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem('theme');var e=document.documentElement;if(t==='dark'){e.classList.add('dark')}else if(t==='light'){e.classList.add('light')}}catch(_){}})();`,
          }}
        />
      </head>
      <body className="bg-surface text-foreground flex min-h-full flex-col font-[family-name:var(--font-body)]">
        <BootSplash />
        <RegisterSW />
        {/* Wraps the page content only. BootSplash and the rest
            below are fixed overlays that must not be inside the scroll
            container Lenis drives. */}
        <SmoothScroll>
          <Providers areas={areas} user={user}>
            {children}
          </Providers>
        </SmoothScroll>
        {/* NO INSTALL GATE. Until Nov 2026 an InstallGate here covered every app
            route (hostels, food, events) in a browser tab with a full-screen
            "Get the Sync app" wall for signed-out visitors. It was removed on
            purpose: every page now opens in a browser and in the installed app
            alike. It was only ever a client-side overlay - proxy.ts and RLS
            are what guard access - so nothing else depended on it. If an
            install nudge comes back, make it dismissible, not a wall: the wall
            kept out exactly the people arriving from a shared WhatsApp link. */}
        {/* Renders nothing on touch devices or under reduced motion. */}
        <Cursor />
      </body>
    </html>
  );
}
