/**
 * AppShell - authenticated student shell.
 *
 * Uses the same chrome as /around: the MarketingHeader (in dockMode) + the
 * horizontal ServicesDock, with a search row beneath. This keeps navigation
 * identical across the public /around feed and the signed-in module pages.
 * Built on the semantic surface tokens so it follows light/dark theme.
 *
 * Used by the (app) route group layout. Pages render inside <main>.
 */
import { MarketingHeader } from './marketing-header';
import { ServicesDock } from './services-dock';
import { AppFooter } from './app-footer';
import { getCurrentUser, getProfile } from '@/modules/auth/queries';

export async function AppShell({ children }: { children: React.ReactNode }) {
  const [user, profile] = await Promise.all([getCurrentUser(), getProfile()]);
  const role = (profile?.role ?? (user?.user_metadata?.role as string | undefined)) as
    | 'student'
    | 'vendor'
    | 'admin'
    | undefined;

  return (
    <div className="bg-surface text-foreground flex min-h-screen flex-col">
      <MarketingHeader dockMode />
      <ServicesDock role={role} />

      <main className="mx-auto w-full max-w-7xl min-w-0 flex-1 px-4 pt-6 pb-10 md:px-6 md:pb-12">
        {children}
      </main>

      {/* Site + legal links, unreachable from the signed-in shell until now.
          dockOffset clears the fixed mobile ServicesDock. */}
      <AppFooter dockOffset />

      {/* NO FLOATING CHAT BUBBLE.

          Messaging lives in ONE place, the Inbox, and it used to live in two:
          a draggable overlay pinned over every screen, plus the real inbox
          route. Two surfaces onto the same conversations table meant two sets
          of unread state, two places to look for the same thread, and a bubble
          sitting on top of the primary action on a small screen.

          The Inbox is a nav destination now, on every dashboard including the
          student one. See config/dashboard-nav. */}
    </div>
  );
}
