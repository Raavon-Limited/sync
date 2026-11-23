/**
 * Switching between the hats one account holds.
 *
 * `profiles.roles` is what you HOLD; `profiles.role` is what you are WEARING.
 * This flips the second to one of the first, and the whole permission system
 * the proxy gate, `current_app_role()`, every RLS policy   reads the same
 * column it always did.
 *
 * WHY IT NAVIGATES AFTERWARDS
 *   The gate is evaluated in the proxy, per request. Switching to `vendor`
 *   while sitting on `/user` leaves you on a page your new role is refused,
 *   so the switch is followed by a move to that role's home. Staying put and
 *   letting the next click 403 would look like the switch had broken.
 *
 * THE MECHANICS LIVE IN AccountSwitchProvider, not here.
 *   Cache reset, navigation, refresh and the loader that covers all three are
 *   shared with AddAccountItem, which performs the same operation. This file
 *   used to own its own copy, and the two drifted: the profile query cache was
 *   never invalidated by either, so `useSession().role` kept serving the old
 *   role for up to five minutes and the switch appeared to need a reload. See
 *   that provider for the full account of what was wrong.
 */
'use client';

import { Check, Loader2, Repeat } from 'lucide-react';
import { DropdownMenuItem, DropdownMenuLabel } from '@/components/ui/dropdown-menu';
import { toast } from '@/components/ui/toast';
import { switchRole } from '@/modules/auth/actions';
import { useAccountSwitch } from '@/providers/account-switch-provider';

/** Where each hat lands, and what to call it. */
const ROLE_HOME: Record<string, { label: string; href: string }> = {
  student: { label: 'Student', href: '/user' },
  vendor: { label: 'Business', href: '/vendor' },
  landlord: { label: 'Landlord', href: '/landlord' },
  rider: { label: 'Rider', href: '/rider' },
  event_manager: { label: 'Organiser', href: '/organiser' },
  admin: { label: 'Admin', href: '/admin' },
  super_admin: { label: 'Admin', href: '/admin' },
};

export function RoleSwitcher({ role, roles }: { role: string; roles: string[] }) {
  const switcher = useAccountSwitch();
  // The whole operation - server call, cache reset and navigation - is one
  // pending window, owned by the provider so the overlay matches it exactly.
  const pending = switcher?.switching ?? false;

  // One hat is not a choice. Rendering a switcher with a single disabled entry
  // is clutter for the overwhelming majority of accounts.
  const switchable = roles.filter((r) => ROLE_HOME[r]);
  if (switchable.length < 2) return null;

  async function choose(next: string) {
    if (next === role || !switcher) return;
    try {
      await switcher.run({
        label: `Switching to ${ROLE_HOME[next].label}…`,
        href: ROLE_HOME[next].href,
        action: () => switchRole(next),
      });
      toast.success(`Switched to ${ROLE_HOME[next].label}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not switch');
    }
  }

  return (
    <>
      <DropdownMenuLabel className="flex items-center gap-1.5">
        <Repeat className="size-3" /> Switch account
      </DropdownMenuLabel>
      {switchable.map((r) => (
        <DropdownMenuItem key={r} onSelect={() => choose(r)} disabled={pending}>
          {r === role ? (
            <Check className="text-accent-fg size-4 shrink-0" />
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
