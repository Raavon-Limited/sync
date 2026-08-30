/**
 * Switching between the hats one account holds.
 *
 * `profiles.roles` is what you HOLD; `profiles.role` is what you are WEARING.
 * This flips the second to one of the first, and the whole permission system —
 * the proxy gate, `current_app_role()`, every RLS policy — reads the same
 * column it always did.
 *
 * WHY IT NAVIGATES AFTERWARDS
 *   The gate is evaluated in the proxy, per request. Switching to `vendor`
 *   while sitting on `/me` leaves you on a page your new role is refused,
 *   so the switch is followed by a push to that role's home. Staying put and
 *   letting the next click 403 would look like the switch had broken.
 *
 * WHY IT REFRESHES
 *   Server components have already rendered with the old role. `router.refresh()`
 *   re-runs them; without it the sidebar and dashboard keep showing the
 *   previous hat until a hard reload.
 */
'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Check, Loader2, Repeat } from 'lucide-react';
import { DropdownMenuItem, DropdownMenuLabel } from '@/components/ui/dropdown-menu';
import { toast } from '@/components/ui/toast';
import { switchRole } from '@/modules/auth/actions';

/** Where each hat lands, and what to call it. */
const ROLE_HOME: Record<string, { label: string; href: string }> = {
  student: { label: 'Student', href: '/me' },
  vendor: { label: 'Business', href: '/vendor' },
  landlord: { label: 'Landlord', href: '/landlord' },
  rider: { label: 'Rider', href: '/rider' },
  admin: { label: 'Admin', href: '/admin' },
  super_admin: { label: 'Admin', href: '/admin' },
};

export function RoleSwitcher({ role, roles }: { role: string; roles: string[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();

  // One hat is not a choice. Rendering a switcher with a single disabled entry
  // is clutter for the overwhelming majority of accounts.
  const switchable = roles.filter((r) => ROLE_HOME[r]);
  if (switchable.length < 2) return null;

  function choose(next: string) {
    if (next === role) return;
    start(async () => {
      try {
        await switchRole(next);
        toast.success(`Switched to ${ROLE_HOME[next].label}`);
        router.push(ROLE_HOME[next].href);
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'Could not switch');
      }
    });
  }

  return (
    <>
      <DropdownMenuLabel className="flex items-center gap-1.5">
        <Repeat className="size-3" /> Switch account
      </DropdownMenuLabel>
      {switchable.map((r) => (
        <DropdownMenuItem key={r} onSelect={() => choose(r)} disabled={pending}>
          {r === role ? (
            <Check className="size-4 shrink-0 text-emerald-600" />
          ) : pending ? (
            <Loader2 className="size-4 shrink-0 animate-spin opacity-40" />
          ) : (
            <span className="size-4 shrink-0" />
          )}
          {ROLE_HOME[r].label}
        </DropdownMenuItem>
      ))}
    </>
  );
}
