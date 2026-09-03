/**
 * Next.js Proxy (renamed from Middleware in Next 16).
 *
 * Two jobs:
 *   1. Refresh the Supabase session on every navigation (so RSC pages see a
 *      valid token) - delegated to `@/lib/supabase/middleware`.
 *   2. Route-group gate: redirect unauthenticated users away from protected
 *      groups, and bounce wrong-role users to a 403 page.
 *
 * Real authorization is enforced by Supabase RLS on the data layer; the
 * checks here are UX (don't render the wrong shell, don't tease a page the
 * user can't load) and a defence in depth.
 *
 * If Supabase env vars are missing (dev without `.env.local` filled in) we
 * can't verify a session, so we treat every visitor as logged-out: public
 * routes pass through, protected routes still redirect to /login. This keeps
 * the auth gate demoable before Supabase is wired.
 *
 * Role for the gate comes from the server-trusted `profiles.role` (resolved in
 * updateSession), with an env admin-allowlist fallback - never the editable
 * `user_metadata`, so a user can't self-assign a role to reach /admin.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { updateSession } from '@/lib/supabase/middleware';
import { isReservedHandle, resolveHandle } from '@/lib/handle';

type Role =
  | 'student'
  | 'vendor'
  | 'landlord'
  | 'rider'
  // Gated here before it is grantable anywhere, the same way /rider was: the
  // prefix is protected from its first commit rather than retrofitted once
  // somebody notices it is open.
  | 'event_manager'
  | 'creator'
  | 'agent'
  | 'admin'
  | 'super_admin';

// Shared marketplace modules: any signed-in user can browse and transact. The
// only role difference is the dashboard (/user vs /vendor vs /landlord vs /rider
// vs /admin).
/**
 * EVERY role, for the modules everybody may use.
 *
 * Hostels, events, food, beauty, laundry, workmanship, search, checkout and
 * the wallet are not student features   they are the marketplace. A landlord
 * rents a room for their child, an agent buys a ticket, a rider orders lunch.
 * Having an account that lists property does not stop somebody being a person.
 *
 * This was a hand-written array and it had drifted: 'agent', 'event_manager'
 * and 'creator' were missing, so those three were redirected to /login when
 * they opened /hostels   while signed in.
 *
 * Built from a Record<Role, true> so the compiler refuses a role that is not
 * listed. Excluding one now has to be deliberate and written somewhere else,
 * not achieved by forgetting.
 */
const EVERY_ROLE: Record<Role, true> = {
  student: true,
  vendor: true,
  landlord: true,
  rider: true,
  agent: true,
  event_manager: true,
  creator: true,
  admin: true,
  super_admin: true,
};

const ALL = Object.keys(EVERY_ROLE) as Role[];

/**
 * Does this path sit UNDER the prefix, as a path segment?
 *
 * A bare `pathname.startsWith(prefix)` matches on characters, not segments, so
 * '/agent' guarded '/agent-invite' as well   the public, token-guarded page
 * where an invited agent sets their password. A signed-out invitee was sent to
 * /login, which found no account for the address and forwarded them to /signup,
 * so the one link that exists to CREATE the account instead asked them to make
 * one from scratch. The invite could never be accepted by anybody new.
 *
 * The same trap is set for any future sibling: '/user-guide' under '/user',
 * '/admin-help' under '/admin'. Matching on the boundary closes all of them at
 * once rather than one route name at a time.
 */
function underPrefix(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

/**
 * Public pages that happen to live UNDER a protected prefix.
 *
 * '/agent-invite' was fixed by matching on segment boundaries, because it only
 * looked nested. '/vendor/join' genuinely is nested, and no boundary rule can
 * help it: it sits under '/vendor', which is gated on the vendor role.
 *
 * WHICH MADE IT UNREACHABLE BY EVERY PERSON IT EXISTS FOR. It is where a
 * storefront team invitation lands   somebody who is not a vendor, usually has
 * no account at all, and is following a link from their email. Gating it on
 * the vendor role means only a vendor can accept an invitation to become one.
 * A signed-out invitee was sent to /login, then to /signup, and the invite
 * expired while they were being asked to create an unrelated account.
 *
 * THE TOKEN IS THE CREDENTIAL on these pages, and it is checked server-side by
 * the RPC behind the form   this list only decides who may see the form. Add a
 * path here only when that is true of it.
 */
const PUBLIC_UNDER_PROTECTED = ['/vendor/join'];

const PROTECTED_PREFIXES: { prefix: string; roles: Role[] }[] = [
  // /around is the public "home of the full Sync app" per the wireframe -
  // signed-out users land here, so it's deliberately not in the gate list.
  { prefix: '/hostels', roles: ALL },
  { prefix: '/events', roles: ALL },
  { prefix: '/food', roles: ALL },
  { prefix: '/beauty', roles: ALL },
  { prefix: '/workmanship', roles: ALL },
  { prefix: '/laundry', roles: ALL },
  { prefix: '/hotspots', roles: ALL },
  { prefix: '/search', roles: ALL },
  { prefix: '/checkout', roles: ALL },
  { prefix: '/wallet', roles: ALL },
  // Dashboards - role-specific. This is the only access difference.
  // BEFORE '/user', and the order is load-bearing: the list is scanned with
  // startsWith and the first match wins, so a broader '/user' listed above would
  // swallow this and refuse the very roles the screen exists for.
  { prefix: '/user/verify', roles: ['student', 'creator', 'event_manager'] },
  { prefix: '/user', roles: ['student'] },
  // Both business roles onboard through the same wizard.
  { prefix: '/onboarding', roles: ['vendor', 'landlord'] },
  { prefix: '/vendor', roles: ['vendor'] },
  { prefix: '/landlord', roles: ['landlord'] },
  // Riders get their own dashboard: the delivery queue, active job and earnings.
  // The route group does not exist yet   this gate is in place so that when it
  // is added it is protected from the first commit rather than retrofitted.
  { prefix: '/rider', roles: ['rider'] },
  // Agents are invited, never self-served   the role cannot be claimed, so this
  // gate is the only door and /agent-invite (public, token-guarded) is the only
  // way to hold the role at all.
  { prefix: '/agent', roles: ['agent'] },
  // The organiser dashboard. The role is not open for signup yet, so in
  // practice this gate is what stops everybody else - which is exactly what it
  // would have to do on the day it opens anyway.
  { prefix: '/organiser', roles: ['event_manager'] },
  /**
   * THE CONSOLE. Commented out for months, and everything downstream assumed it
   * was not: `admin/layout.tsx` said in so many words that authorisation was
   * "enforced by the proxy". It was not enforced anywhere but on the pages
   * themselves, one `requireStaff()` at a time, and the day one page forgot
   * /admin/notifications did   the console rendered for anyone signed in.
   *
   * The page guards STAY. This gate protects a navigation; `requireStaff` and
   * `assertStaffArea` protect a request, and the admin actions run on the
   * service-role client which is above RLS by construction. Neither is a
   * substitute for the other, which is the whole reason the missing one was not
   * noticed.
   */
  { prefix: '/admin', roles: ['admin', 'super_admin'] },
];

/**
 * Where /<handle> rewrites to, per role.
 *
 * `agent` was missing from the chain this replaces, so `base` came out null,
 * the rewrite never happened and /<their-handle> fell through to a 404   which
 * is what the "Dashboard" link in the account menu points at. A signed-in agent
 * clicking Dashboard was told the page did not exist.
 *
 * null means "no handle-rooted dashboard": admins go to /admin explicitly, and
 * a creator has no dashboard of their own yet. Those are decisions, not gaps,
 * so they are written down rather than left to a fall-through.
 *
 * A Record<Role, …> so adding a role without deciding this is a type error.
 */
const HANDLE_DASHBOARD: Record<Role, string | null> = {
  student: '/user',
  landlord: '/landlord',
  vendor: '/vendor',
  rider: '/rider',
  event_manager: '/organiser',
  agent: '/agent',
  creator: null,
  admin: null,
  super_admin: null,
};

const supabaseConfigured = Boolean(
  process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
);

function redirectToLogin(request: NextRequest, pathname: string) {
  const url = request.nextUrl.clone();
  url.pathname = '/login';
  url.searchParams.set('next', pathname);
  return NextResponse.redirect(url);
}

export async function proxy(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  const segments = pathname.split('/').filter(Boolean);
  const firstSeg = segments[0];
  // The exemption is consulted FIRST, so a public path under a protected
  // prefix never reaches the role check at all.
  const publiclyExempt = PUBLIC_UNDER_PROTECTED.some((path) => underPrefix(pathname, path));
  const guarded = publiclyExempt
    ? undefined
    : PROTECTED_PREFIXES.find(({ prefix }) => underPrefix(pathname, prefix));

  // Supabase not configured yet → no session can exist → everyone is
  // logged-out. Gate protected routes, let public ones through.
  if (!supabaseConfigured) {
    if (process.env.NODE_ENV !== 'production') {
      console.warn('[proxy] Supabase env vars missing - treating visitor as logged-out.');
    }
    return guarded ? redirectToLogin(request, pathname) : NextResponse.next({ request });
  }

  const { response, user, role: trustedRole, isStorefrontStaff } = await updateSession(request);

  // Personalised dashboard handles: /<handle>/<page> → the real /user or /vendor
  // page, but ONLY when <handle> is the signed-in user's own handle (private).
  // Non-handle / unknown segments fall through and Next renders 404 as usual.
  if (firstSeg && !isReservedHandle(firstSeg)) {
    if (user) {
      const meta = user.user_metadata ?? {};
      // Server-trusted role (profiles.role), never the editable user_metadata:
      // a landlord whose metadata still reads 'vendor' must not rewrite to
      // /vendor, and the handle must match what the sidebar links to.
      const role = (trustedRole as Role | undefined) ?? 'student';
      const handle = resolveHandle({
        role,
        full_name: meta.full_name as string | undefined,
        business_name: meta.business_name as string | undefined,
        email: user.email,
      });
      const base = HANDLE_DASHBOARD[role] ?? null;
      if (handle && base && firstSeg === handle) {
        const rest = segments.slice(1).join('/');
        const url = request.nextUrl.clone();
        url.pathname = rest ? `${base}/${rest}` : base;
        const rewritten = NextResponse.rewrite(url, { request });
        // Carry over the refreshed Supabase auth cookies onto the rewrite.
        response.cookies.getAll().forEach((c) => rewritten.cookies.set(c));
        return rewritten;
      }
    }
    return response;
  }

  if (!guarded) return response;

  if (!user) return redirectToLogin(request, pathname);

  // Server-trusted role (profiles.role / admin allowlist), not the editable
  // user_metadata - so a user can't self-assign a role to reach /admin.
  const role = (trustedRole as Role | undefined) ?? 'student';
  if (!guarded.roles.includes(role)) {
    // One exception: a branch manager. They are invited to run a storefront and
    // keep their own role - usually 'student' - so a pure role gate would send
    // them to /403 on the dashboard they were just granted. Membership is
    // resolved server-side against storefront_staff, never from a claim the
    // client can set, and RLS still decides what they may see once inside.
    const isInvitedManager = guarded.prefix === '/vendor' && isStorefrontStaff;
    if (!isInvitedManager) {
      const url = request.nextUrl.clone();
      url.pathname = '/403';
      return NextResponse.rewrite(url);
    }
  }

  return response;
}

export const config = {
  // Run on every route except Next internals, static assets, the dev
  // design-system page, and webhook endpoints (those authenticate
  // themselves via signature, not session cookies).
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|dev/design-system|api/webhooks|.*\\.(?:svg|png|jpg|jpeg|gif|webp|woff|woff2)$).*)',
  ],
};
