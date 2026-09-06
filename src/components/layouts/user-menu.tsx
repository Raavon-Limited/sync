/**
 * UserMenu - the signed-in avatar + dropdown. Replaces the "Sign in / Sign up"
 * buttons once a user is authenticated. Profile → /user, a role-aware dashboard
 * link, and Sign out (which clears the session and refreshes so the server
 * components re-render in the signed-out state).
 *
 * Receives a plain user summary from a server component (no client auth store
 * needed - the proxy keeps the session fresh and router.refresh() re-reads it).
 *
 * IT CARRIES THE ROLE SWITCHER, AND IT HAS TO.
 *   Switching hats writes `profiles.role`, so it persists across sessions - it
 *   is not a per-tab view. This menu had no switcher while the dashboard one
 *   did, which made "Student" a one-way door for a multi-role account: a super
 *   admin who put on their student hat landed on the public site, where the
 *   only menu could no longer take it off. /admin then refused them, because
 *   `requireStaff` and `is_staff()` read the worn role. The account still HELD
 *   super_admin the whole time; nothing on screen could act on it.
 *
 *   That happened to admin@letsyncyou.com. Anywhere a hat can be put on, it
 *   must be possible to take off - so the switcher belongs in every account
 *   menu, not just the one behind a gate you may have just locked.
 */
'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { LayoutDashboard, LogOut } from 'lucide-react';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { toast } from '@/components/ui/toast';
import { AFTER_SIGN_OUT } from '@/config/site';
import { signOut } from '@/modules/auth/actions';
import { RoleSwitcher } from './role-switcher';

// Every role that can be worn, so the badge never falls through to the raw
// column value - an admin's badge read "super_admin" before these were added.
const ROLE_LABELS: Record<string, string> = {
  student: 'Student',
  vendor: 'Vendor',
  landlord: 'Landlord',
  rider: 'Rider',
  agent: 'Agent',
  event_manager: 'Organiser',
  admin: 'Admin',
  super_admin: 'Admin',
};
const CATEGORY_LABELS: Record<string, string> = {
  landlord: 'Landlord',
  food: 'Food vendor',
  beauty: 'Beauty pro',
  laundry: 'Laundry',
  tradesman: 'Tradesman',
};

export interface UserMenuProps {
  name: string;
  email: string;
  initial: string;
  role?: string;
  /** Every hat the account holds. The switcher renders nothing below two. */
  roles?: string[];
  category?: string;
  /** Name-based dashboard handle for students/vendors (e.g. "muiz-owolabi"). */
  handle?: string;
}

export function UserMenu({ name, email, initial, role, roles, category, handle }: UserMenuProps) {
  const router = useRouter();
  // Everyone gets a "Dashboard" link. Students/vendors/landlords go to their
  // name-based handle URL (/muiz-owolabi) which the proxy rewrites to the right
  // dashboard; admins to /admin; fall back to the static base per role.
  const isAdmin = role === 'admin' || role === 'super_admin';

  // The no-handle fallback. It ended at '/user' for every role it did not name,
  // so an agent without a handle was sent to a student dashboard   and WITH a
  // handle they were sent to /<handle>, which 404'd until the proxy learned the
  // agent rewrite (see HANDLE_DASHBOARD in proxy.ts). This is the half that
  // does not depend on a handle existing.
  const DASHBOARD_BY_ROLE: Record<string, string> = {
    landlord: '/landlord',
    vendor: '/vendor',
    rider: '/rider',
    agent: '/agent',
    event_manager: '/organiser',
    student: '/user',
  };

  const dashboardHref = isAdmin
    ? '/admin'
    : handle
      ? `/${handle}`
      : (role && DASHBOARD_BY_ROLE[role]) || '/user';

  const roleLabel = role ? (ROLE_LABELS[role] ?? role) : null;
  const categoryLabel = category ? (CATEGORY_LABELS[category] ?? category) : null;
  // Landlords already read "Landlord" from the role label, so only vendors need
  // the category appended (e.g. "Vendor · Food vendor").
  const badge = [roleLabel, role === 'vendor' ? categoryLabel : null].filter(Boolean).join(' · ');

  async function handleSignOut() {
    const res = await signOut();
    if (!res.ok) {
      toast(res.error);
      return;
    }
    router.push(AFTER_SIGN_OUT);
    router.refresh();
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label="Account menu"
          className="focus-visible:ring-foreground/30 rounded-full focus:outline-none focus-visible:ring-2"
        >
          <Avatar className="h-9 w-9">
            <AvatarFallback>{initial}</AvatarFallback>
          </Avatar>
        </button>
      </DropdownMenuTrigger>

      <DropdownMenuContent>
        <DropdownMenuLabel>
          <p className="text-content truncate text-sm font-medium">{name}</p>
          <p className="text-content-muted truncate text-xs">{email}</p>
          {badge && (
            <span className="bg-lime/15 text-accent-fg mt-1.5 inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium">
              {badge}
            </span>
          )}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />

        {/* Renders nothing for the single-hat accounts that are the vast
            majority, so this costs them no menu space. */}
        {role && roles && roles.length > 0 && (
          <>
            <RoleSwitcher role={role} roles={roles} />
            <DropdownMenuSeparator />
          </>
        )}

        <DropdownMenuItem asChild>
          <Link href={dashboardHref}>
            <LayoutDashboard className="h-4 w-4" /> Dashboard
          </Link>
        </DropdownMenuItem>

        <DropdownMenuSeparator />
        <DropdownMenuItem
          className="text-coral"
          onSelect={(e) => {
            e.preventDefault();
            handleSignOut();
          }}
        >
          <LogOut className="h-4 w-4" /> Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
