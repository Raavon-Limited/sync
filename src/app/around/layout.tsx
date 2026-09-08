/**
 * Layout for /around - the public "home of the full Sync app" per the
 * wireframe annotation. Marketing header + persistent services dock +
 * the shared slim AppFooter (NOT the full marketing footer).
 *
 * Sits OUTSIDE the (app) auth group on purpose: signed-out users land here.
 * Auth-only personalisation will get layered in later (avatar replaces the
 * Sign in / List a property buttons).
 */
import { AppFooter } from '@/components/layouts/app-footer';
import { MarketingHeader } from '@/components/layouts/marketing-header';
import { ServicesDock } from '@/components/layouts/services-dock';
import { getCurrentUser, getProfile } from '@/modules/auth/queries';

export default async function AroundLayout({ children }: { children: React.ReactNode }) {
  const [user, profile] = await Promise.all([getCurrentUser(), getProfile()]);
  const role = (profile?.role ?? (user?.user_metadata?.role as string | undefined)) as
    | 'student'
    | 'vendor'
    | 'admin'
    | undefined;

  // No LocationProvider here any more: it is mounted at the root so the chosen
  // area scopes every route, not just this one, and survives leaving /around.
  return (
    <>
      <div className="bg-surface text-foreground flex min-h-screen flex-col">
        <MarketingHeader dockMode />
        <ServicesDock role={role} />
        <div className="flex-1 md:pb-0">{children}</div>
        {/* The shared slim footer, not a bespoke copyright line - /around is the
            app's front door, so the explainer and legal pages have to be
            reachable from here too. */}
        <AppFooter dockOffset />
      </div>

      {/* NO FLOATING CHAT BUBBLE.

          Messaging lives in ONE place, the Inbox, and it used to live in two:
          a draggable overlay pinned over every screen, plus the real inbox
          route. Two surfaces onto the same conversations table meant two sets
          of unread state, two places to look for the same thread, and a bubble
          sitting on top of the primary action on a small screen.

          The Inbox is a nav destination now, on every dashboard including the
          student one. See config/dashboard-nav. */}
    </>
  );
}
