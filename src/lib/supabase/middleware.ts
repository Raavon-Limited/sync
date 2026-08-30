/**
 * Supabase session refresh - called from the top-level middleware.ts on
 * every navigation. Refreshes the auth token if it's expired and forwards
 * the response with up-to-date cookies attached.
 *
 * Also exposes the authenticated user (or `null`) so the caller can make
 * role-based routing decisions before the page renders.
 */
import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { adminRoleForEmail } from '@/lib/admin-emails';
import type { Database } from '@/types/database.types';

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // IMPORTANT: never trust getSession() for auth - it doesn't hit Supabase
  // and the cookie could be spoofed. getUser() verifies with the Auth server.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Trusted role for the gate: the env admin allowlist wins for founding admins
  // (so they're recognised even if profiles.role is still the clamped default),
  // then the server-controlled `profiles.role`, then editable user_metadata.
  let role: string | undefined;
  if (user) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .maybeSingle();
    role =
      adminRoleForEmail(user.email) ??
      (profile?.role as string | undefined) ??
      (user.user_metadata?.role as string | undefined);
  }

  // MANAGING A STORE IS NOT THE SAME AS BEING A VENDOR.
  // Someone invited to run a branch keeps their own role - usually 'student' -
  // so the `/vendor` gate would bounce them off the dashboard they were just
  // given access to. Ask the membership table instead of the role.
  //
  // Deliberately conditional: only for /vendor requests, and only when the role
  // gate has already failed. Every other request pays nothing for this.
  let isStorefrontStaff = false;
  if (user && role !== 'vendor' && request.nextUrl.pathname.startsWith('/vendor')) {
    // Runs as the user: storefront_staff_read lets them see their own rows.
    const { data: membership } = await supabase
      .from('storefront_staff')
      .select('id')
      .eq('user_id', user.id)
      .is('revoked_at', null)
      .limit(1)
      .maybeSingle();
    isStorefrontStaff = !!membership;
  }

  return { response, user, role, isStorefrontStaff };
}
