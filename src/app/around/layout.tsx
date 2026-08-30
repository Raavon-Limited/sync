/**
 * Layout for /around - the public "home of the full Sync app" per the
 * wireframe annotation. Marketing header + persistent services dock +
 * slim footer (NOT the full marketing footer).
 *
 * Sits OUTSIDE the (app) auth group on purpose: signed-out users land here.
 * Auth-only personalisation will get layered in later (avatar replaces the
 * Sign in / List a property buttons).
 */
import Link from 'next/link';
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
        <footer className="border-line/5 mt-12 border-t pb-[calc(7rem+env(safe-area-inset-bottom))] md:pb-0">
          <div className="text-content-muted mx-auto flex max-w-7xl items-center justify-between px-6 py-6 text-xs">
            <span>© {new Date().getFullYear()} Sync</span>
            <Link href="/" className="hover:text-foreground transition-colors">
              Around you · feed
            </Link>
          </div>
        </footer>
      </div>
    </>
  );
}
