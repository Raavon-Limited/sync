/**
 * The staff list, and the two changes a super admin can make to it.
 *
 * WHAT THE UI ENFORCES AND WHAT IT ONLY REFLECTS
 *   `set_account_role` refuses a non-super-admin, refuses removing the last
 *   super admin, and refuses removing your own access — in the database, where
 *   a request that never touched this component still meets them. Everything
 *   here is presentation: an admin sees the list without controls, and a super
 *   admin sees a Remove button that is absent on themselves.
 *
 *   Which is why the errors from the server are shown verbatim rather than
 *   pre-empted. If the rules and the buttons ever disagree, the sentence the
 *   database wrote is the true one.
 *
 * REMOVING ACCESS RETURNS SOMEBODY TO 'student', NOT TO NOTHING.
 *   There is no such thing as an account with no role — `profiles_active_role_is_held`
 *   requires the active role to be one they hold. Losing console access is a
 *   demotion to an ordinary account, and their vendor or rider profile, if they
 *   have one, is untouched.
 */
'use client';

import { useState, useTransition } from 'react';
import { Loader2, ShieldCheck, UserPlus, UserMinus } from 'lucide-react';
import { Badge, Button, Input } from '@/components/ui';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { addStaffByEmail, setAccountRole } from '@/modules/admin/actions';
import type { StaffMember } from '@/modules/admin/staff';

const ROLE_BADGE: Record<string, string> = {
  super_admin: 'bg-lime/15 text-lime-deep',
  admin: 'bg-ink/5 text-content-muted',
};

const ROLE_LABEL: Record<string, string> = {
  super_admin: 'Super admin',
  admin: 'Admin',
};

export function StaffConsole({
  staff,
  isSuperAdmin,
}: {
  staff: StaffMember[];
  isSuperAdmin: boolean;
}) {
  const [busy, startTransition] = useTransition();
  const [email, setEmail] = useState('');
  const [newRole, setNewRole] = useState<'admin' | 'super_admin'>('admin');
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function run(fn: () => Promise<unknown>, onDone?: (v: unknown) => void) {
    setError(null);
    setMessage(null);
    startTransition(async () => {
      try {
        const v = await fn();
        onDone?.(v);
      } catch (e) {
        // Verbatim. The database writes better sentences about its own rules
        // than a generic fallback would.
        setError(e instanceof Error ? e.message : 'That did not go through.');
      }
    });
  }

  const superAdmins = staff.filter((s) => s.role === 'super_admin').length;

  return (
    <div className="flex flex-col gap-4">
      {isSuperAdmin && (
        <div className="border-line/10 bg-panel flex flex-wrap items-center gap-2 rounded-xl border p-4">
          <UserPlus className="text-content-muted size-4 shrink-0" aria-hidden="true" />
          <Input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Their email address"
            className="min-w-0 flex-1"
            type="email"
          />
          <Select value={newRole} onValueChange={(v) => setNewRole(v as 'admin' | 'super_admin')}>
            <SelectTrigger className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="admin">Admin</SelectItem>
              <SelectItem value="super_admin">Super admin</SelectItem>
            </SelectContent>
          </Select>
          <Button
            disabled={busy || !email.trim()}
            onClick={() =>
              run(
                () => addStaffByEmail({ email, role: newRole }),
                (name) => {
                  setEmail('');
                  setMessage(
                    `${String(name)} now has ${ROLE_LABEL[newRole].toLowerCase()} access.`,
                  );
                },
              )
            }
          >
            {busy && <Loader2 className="animate-spin" aria-hidden="true" />}
            Give access
          </Button>
          <p className="text-content-muted w-full text-xs">
            They need a Sync account already — this grants access to one, it does not create one. A
            super admin can appoint and remove other admins; an admin cannot.
          </p>
          {message && <p className="w-full text-xs text-emerald-600">{message}</p>}
          {error && <p className="text-coral w-full text-xs">{error}</p>}
        </div>
      )}

      {staff.length === 0 ? (
        <p className="text-content-muted border-line/10 rounded-xl border border-dashed p-8 text-center text-sm">
          Nobody has console access. That should be impossible — you are reading this page.
        </p>
      ) : (
        <div className="border-line/10 divide-line/10 divide-y rounded-xl border">
          {staff.map((s) => (
            <div key={s.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
              <ShieldCheck
                className={`size-4 shrink-0 ${
                  s.role === 'super_admin' ? 'text-lime-deep' : 'text-content-muted'
                }`}
                aria-hidden="true"
              />
              <div className="min-w-0 flex-1">
                <p className="text-content flex flex-wrap items-center gap-2 text-sm font-medium">
                  {s.name}
                  <Badge className={ROLE_BADGE[s.role] ?? ROLE_BADGE.admin}>
                    {ROLE_LABEL[s.role] ?? s.role}
                  </Badge>
                </p>
                <p className="text-content-muted text-xs">
                  {s.email} · since{' '}
                  {new Date(s.createdAt).toLocaleDateString('en-NG', {
                    month: 'short',
                    year: 'numeric',
                  })}
                </p>
              </div>

              {isSuperAdmin && (
                <div className="flex flex-wrap items-center gap-2">
                  {/* Offered only where it would do something. Promoting a
                      super admin or demoting the last one both fail in the
                      database, and a button whose only outcome is an error is
                      worse than no button. */}
                  {s.role === 'admin' && (
                    <Button
                      variant="outline"
                      disabled={busy}
                      onClick={() =>
                        run(
                          () => setAccountRole({ userId: s.id, role: 'super_admin' }),
                          () => setMessage(`${s.name} is now a super admin.`),
                        )
                      }
                    >
                      Make super admin
                    </Button>
                  )}

                  {!(s.role === 'super_admin' && superAdmins <= 1) && (
                    <Button
                      variant="ghost"
                      className="text-coral"
                      disabled={busy}
                      onClick={() => {
                        const ok = window.confirm(
                          `Remove ${s.name}'s console access?\n\n` +
                            'They keep their Sync account and become an ordinary user. ' +
                            'You can give it back at any time.',
                        );
                        if (ok) {
                          run(
                            () => setAccountRole({ userId: s.id, role: 'student' }),
                            () => setMessage(`${s.name} no longer has console access.`),
                          );
                        }
                      }}
                    >
                      <UserMinus aria-hidden="true" />
                      Remove
                    </Button>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {!isSuperAdmin && (
        <p className="text-content-muted text-xs">
          Only a super admin can add or remove access. Ask one of the people marked super admin
          above.
        </p>
      )}
    </div>
  );
}
