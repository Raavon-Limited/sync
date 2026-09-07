/**
 * MarketingHeader - public top bar.
 *
 * Desktop (md+): 3-column grid - nav links split left & right around a
 * centered logo, with the auth/CTA cluster pinned to the far right.
 * Mobile (<md): logo on the left, hamburger (MobileMenu) on the right.
 *
 * Logo: the brand kit's mark + Sync wordmark (<SyncLogo>), following currentColor.
 */
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ThemeToggle } from '@/components/ui/theme-toggle';
import { MobileMenu } from './mobile-menu';
import { UserMenu } from './user-menu';
import { SearchBar } from '@/components/shared/search-bar';
import { getCurrentUser, getFirstName, getProfile } from '@/modules/auth/queries';
import { resolveHandle } from '@/lib/handle';
import { SITE } from '@/config/site';
import { SyncLogo } from '@/components/brand/sync-logo';

// Module nav from the hi-fi guide, split around the centered logo. These are
// hidden in `dockMode` (e.g. /around) since the ServicesDock already lists them.
/**
 * The landing header carries ONE nav item. The modules used to be split
 * across a left and a right nav plus an About link, putting eight
 * destinations in front of someone who has not signed up yet. Around you is
 * the front door; everything else lives behind it.
 *
 * About is still reachable from the mobile menu.
 */
const LEFT_LINKS = [{ href: '/around', label: 'Around you' }];

function NavLink({ href, label }: { href: string; label: string }) {
  return (
    <Link href={href} className="text-foreground hover:text-accent-fg transition-colors">
      {label}
    </Link>
  );
}

interface MarketingHeaderProps {
  /**
   * When true (screens that also render the ServicesDock, e.g. /around), the
   * module nav is hidden to avoid duplicating the dock. The left side instead
   * shows just the active module (lime, with a live dot).
   */
  dockMode?: boolean;
}

export async function MarketingHeader({ dockMode = false }: MarketingHeaderProps) {
  const user = await getCurrentUser();
  const profile = await getProfile();
  const meta = user?.user_metadata ?? {};
  // Trusted role from the profiles table, falling back to metadata (e.g. before
  // the migration is run). See modules/auth/queries.ts.
  const role = (profile?.role ?? (meta.role as 'student' | 'vendor' | 'admin' | undefined)) as
    | 'student'
    | 'vendor'
    | 'admin'
    | undefined;
  const name =
    profile?.full_name ||
    (meta.full_name as string | undefined) ||
    user?.email?.split('@')[0] ||
    'You';
  const initial = (getFirstName(user) ?? name).charAt(0).toUpperCase();
  const category = profile?.vendor_category ?? (meta.vendor_category as string | undefined);
  // Name-based dashboard handle (matches the proxy's rewrite source).
  const handle =
    resolveHandle({
      role,
      full_name: meta.full_name as string | undefined,
      business_name: meta.business_name as string | undefined,
      email: user?.email,
    }) ?? undefined;

  // The brand kit's mark, not a hand-drawn stand-in. It follows `currentColor`,
  // so the mark and wordmark invert with the theme - the kit's own guidance is
  // to prefer the component over the SVG files for exactly this reason.
  const logo = (
    <Link
      href="/"
      className="text-foreground flex shrink-0 items-center"
      aria-label={`${SITE.name} home`}
    >
      <SyncLogo height={20} />
    </Link>
  );

  const rightCluster = (
    <div className="flex items-center justify-end gap-6">
      <ThemeToggle className="hidden md:inline-flex" />
      {user ? (
        <UserMenu
          name={name}
          email={user.email ?? ''}
          initial={initial}
          role={role}
          // Free: getProfile() is already resolved above. Without it this menu
          // cannot take a hat off - see the note at the top of UserMenu.
          roles={profile?.roles ?? undefined}
          category={category}
          handle={handle}
        />
      ) : (
        <div className="hidden items-center gap-2 md:flex">
          <Button
            asChild
            variant="ghost"
            size="sm"
            className="text-foreground hover:bg-foreground/10"
          >
            <Link href="/login">Sign in / Sign up</Link>
          </Button>
          <Button asChild size="sm">
            <Link href="/signup?role=vendor&category=landlord">
              List a property <ArrowRight />
            </Link>
          </Button>
        </div>
      )}
      {/* Hamburger - mobile only, far right */}
      <MobileMenu signedIn={!!user} name={name} email={user?.email ?? ''} role={role} handle={handle} />
    </div>
  );

  return (
    <header className="bg-surface/90 border-line/5 sticky top-0 z-40 border-b backdrop-blur">
      {dockMode ? (
        // App pages: logo · general search · cluster. The ServicesDock already
        // shows the active module, so the header carries the search instead.
        // `justify-between` is what pins the avatar + hamburger to the right
        // edge on mobile. The search below is hidden at that width, and it was
        // the `flex-1` spacer doing that job - without it the cluster bunched up
        // against the logo. Padding matches the dock row (px-4) so the search
        // and the logo share a left edge.
        <div className="mx-auto flex h-16 items-center justify-between gap-3 px-4 md:gap-5 md:px-6">
          {logo}
          {/* Desktop only. On mobile the search sits in the ServicesDock row
              beside the location pill instead: the header already carries the
              logo, avatar and hamburger, and the dock row was holding nothing
              but a right-aligned pill, so pairing them reclaims a whole row. */}
          <div className="hidden flex-1 md:block">
            <SearchBar className="mx-auto w-full max-w-lg" />
          </div>
          {rightCluster}
        </div>
      ) : (
        <div className="mx-auto flex h-16 items-center justify-between gap-4 px-6 md:grid md:grid-cols-[1fr_auto_1fr]">
          {/* Left nav - desktop only */}
          <nav
            aria-label="Primary left"
            className="hidden items-center gap-5 text-sm md:flex md:justify-start"
          >
            {LEFT_LINKS.map((l) => (
              <NavLink key={l.href} {...l} />
            ))}
          </nav>
          {/* Logo - centered on desktop */}
          <div className="md:justify-self-center">{logo}</div>
          {rightCluster}
        </div>
      )}
    </header>
  );
}
