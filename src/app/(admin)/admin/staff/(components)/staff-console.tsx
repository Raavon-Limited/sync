/**
 * The staff roster: who is in the console, what each of them can reach, and
 * the three changes a super admin can make to it.
 *
 * WHAT THE UI ENFORCES AND WHAT IT ONLY REFLECTS
 *   `set_account_role` refuses a non-super-admin, refuses removing the last
 *   super admin, and refuses removing your own access — in the database, where
 *   a request that never touched this component still meets them.
 *   `create_staff_invite` refuses anyone but a super admin. Everything here is
 *   presentation: an admin sees the list without controls, and a super admin
 *   sees a Remove button that is absent on themselves.
 *
 *   Which is why errors from the server are shown verbatim rather than
 *   pre-empted. If the rules and the buttons ever disagree, the sentence the
 *   database wrote is the true one.
 *
 * ROLES ARE SET HERE, NOT ONLY IN THE ROLE EDITOR BELOW
 *   The editor answers "who can do this"; this answers "what can Musa do", and
 *   the second question is the one somebody has after a shift handover. Same
 *   rows, same action — a chip per role, on the person.
 *
 * REMOVING ACCESS RETURNS SOMEBODY TO 'student', NOT TO NOTHING.
 *   There is no such thing as an account with no role —
 *   `profiles_active_role_is_held` requires the active role to be one they
 *   hold. Losing console access is a demotion to an ordinary account, and their
 *   vendor or rider profile, if they have one, is untouched.
 */
'use client';

import { useState, useTransition } from 'react';
import { Check, Clock, Copy, Loader2, Mail, ShieldCheck, UserMinus, X } from 'lucide-react';
import { Badge, Button, Input } from '@/components/ui';
import { cn } from '@/lib/utils';
import { setAccountRole, setRoleMembership } from '@/modules/admin/actions';
import { cancelStaffInvite, inviteStaff } from '@/modules/admin/invite-actions';
import type { StaffMember } from '@/modules/admin/staff';
import type { StaffInvite } from '@/modules/admin/invites';
import type { AccessRole } from '@/modules/admin/roles';

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
  invites,
  roles,
  isSuperAdmin,
}: {
  staff: StaffMember[];
  invites: StaffInvite[];
  roles: AccessRole[];
  isSuperAdmin: boolean;
}) {
  const [busy, startTransition] = useTransition();
  const [email, setEmail] = useState('');
  const [roleId, setRoleId] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  /* The link, kept on screen after an invite is created.
     It is shown whether or not the email went out: the token is returned
     exactly once and is never readable again, so a link dismissed before the
     mail failed would be a link nobody can recover. */
  const [link, setLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

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

  /* Which roles each person holds, inverted from the roles list.
     `getAccessRoles` already reads the memberships to show them on the role, so
     asking again per person would be the same rows fetched a second way. */
  const rolesByUser = new Map<string, Set<string>>();
  for (const role of roles) {
    for (const m of role.members) {
      const set = rolesByUser.get(m.id) ?? new Set<string>();
      set.add(role.id);
      rolesByUser.set(m.id, set);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {isSuperAdmin && (
        <div className="border-line/10 bg-panel flex flex-col gap-3 rounded-xl border p-4">
          <div className="flex flex-wrap items-center gap-2">
            <Mail className="text-content-muted size-4 shrink-0" aria-hidden="true" />
            <Input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Their email address"
              className="min-w-56 flex-1"
              type="email"
            />
            {/* A plain select, not the design-system one: this sits inside a
                row of inputs and needs to look like the input beside it. */}
            <select
              value={roleId}
              onChange={(e) => setRoleId(e.target.value)}
              aria-label="Role to invite them into"
              className="border-line/15 bg-surface text-content h-10 min-w-40 rounded-lg border px-3 text-sm"
            >
              <option value="">No role yet</option>
              {roles.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>
            <Button
              disabled={busy || !email.trim()}
              onClick={() =>
                run(
                  () => inviteStaff({ email, roleId: roleId || null }),
                  (result) => {
                    const res = result as Awaited<ReturnType<typeof inviteStaff>>;
                    setEmail('');
                    setCopied(false);
                    if (res.kind === 'granted') {
                      setLink(null);
                      setMessage(`${res.name} already had an account, and now has console access.`);
                      return;
                    }
                    setLink(res.link);
                    setMessage(
                      res.emailed
                        ? `Invitation sent to ${res.email}. The link works for 10 minutes.`
                        : `Invitation created for ${res.email}, but the email did not send. ${res.emailError ?? ''}`,
                    );
                  },
                )
              }
            >
              {busy && <Loader2 className="animate-spin" aria-hidden="true" />}
              Send invitation
            </Button>
          </div>

          <p className="text-content-muted text-xs">
            They do not need a Sync account. If the address has one, access is granted straight
            away; if it does not, they get a link that works for 10 minutes and set their own
            password on the way in — no password is ever emailed. If it lapses before they open it,
            invite them again. Super admin is not offered here: it can appoint and remove everyone
            else, so it is granted deliberately from the database rather than from a form somebody
            could reach through a hijacked session.
          </p>

          {message && <p className="text-xs text-emerald-600">{message}</p>}
          {error && <p className="text-coral text-xs">{error}</p>}

          {link && (
            <div className="border-line/10 bg-surface flex flex-wrap items-center gap-2 rounded-lg border p-2">
              <code className="text-content-muted min-w-0 flex-1 truncate text-xs">{link}</code>
              <Button
                variant="ghost"
                onClick={() => {
                  void navigator.clipboard.writeText(link).then(() => setCopied(true));
                }}
              >
                {copied ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
                {copied ? 'Copied' : 'Copy link'}
              </Button>
            </div>
          )}
        </div>
      )}

      {/* Invitations nobody has accepted yet. Above the roster because this is
          the list with something outstanding on it. */}
      {invites.length > 0 && (
        <div className="border-line/10 divide-line/10 divide-y rounded-xl border">
          {invites.map((inv) => (
            <div key={inv.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
              <Clock className="text-content-muted size-4 shrink-0" aria-hidden="true" />
              <div className="min-w-0 flex-1">
                <p className="text-content flex flex-wrap items-center gap-2 text-sm font-medium">
                  {inv.email}
                  <Badge className="bg-ink/5 text-content-muted">
                    {inv.expired ? 'expired' : 'invited'}
                  </Badge>
                  {inv.roleName && (
                    <Badge className="bg-lime/10 text-lime-deep">{inv.roleName}</Badge>
                  )}
                </p>
                <p className="text-content-muted text-xs">
                  Invited by {inv.invitedByName} ·{' '}
                  {inv.expired
                    ? 'the link no longer works — invite again to send a new one'
                    : `expires ${new Date(inv.expiresAt).toLocaleTimeString('en-NG', {
                        hour: 'numeric',
                        minute: '2-digit',
                      })}`}
                </p>
              </div>
              {isSuperAdmin && (
                <Button
                  variant="ghost"
                  className="text-coral"
                  disabled={busy}
                  onClick={() =>
                    run(
                      () => cancelStaffInvite({ id: inv.id }),
                      () => setMessage(`The invitation to ${inv.email} was cancelled.`),
                    )
                  }
                >
                  <X aria-hidden="true" />
                  Cancel
                </Button>
              )}
            </div>
          ))}
        </div>
      )}

      {staff.length === 0 ? (
        <p className="text-content-muted border-line/10 rounded-xl border border-dashed p-8 text-center text-sm">
          Nobody has console access. That should be impossible — you are reading this page.
        </p>
      ) : (
        <div className="border-line/10 divide-line/10 divide-y rounded-xl border">
          {staff.map((s) => {
            const held = rolesByUser.get(s.id) ?? new Set<string>();
            return (
              <div key={s.id} className="flex flex-wrap items-start gap-3 px-4 py-3">
                <ShieldCheck
                  className={`mt-0.5 size-4 shrink-0 ${
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

                  {/* The roles this person holds, as toggles.
                      A super admin's chips are shown but dead: they bypass
                      grants entirely, so ticking one would change a row that
                      decides nothing and read as though it had. */}
                  {roles.length > 0 && (
                    <div className="mt-2 flex flex-wrap items-center gap-1.5">
                      {s.role === 'super_admin' ? (
                        <span className="text-content-muted text-xs">
                          Super admin — every area, roles do not apply.
                        </span>
                      ) : (
                        roles.map((r) => {
                          const on = held.has(r.id);
                          return (
                            <button
                              key={r.id}
                              type="button"
                              disabled={busy || !isSuperAdmin}
                              aria-pressed={on}
                              onClick={() =>
                                run(
                                  () =>
                                    setRoleMembership({
                                      roleId: r.id,
                                      userId: s.id,
                                      member: !on,
                                    }),
                                  () =>
                                    setMessage(
                                      on
                                        ? `${s.name} is no longer ${r.name}.`
                                        : `${s.name} is now ${r.name}.`,
                                    ),
                                )
                              }
                              className={cn(
                                'rounded-full border px-2.5 py-1 text-xs transition-colors',
                                on
                                  ? 'border-lime/40 bg-lime/15 text-lime-deep font-medium'
                                  : 'border-line/15 text-content-muted hover:text-content',
                                !isSuperAdmin && 'cursor-not-allowed opacity-60',
                              )}
                            >
                              {r.name}
                            </button>
                          );
                        })
                      )}
                    </div>
                  )}
                </div>

                {isSuperAdmin && (
                  <div className="flex flex-wrap items-center gap-2">
                    {/* NO PROMOTE-TO-SUPER-ADMIN BUTTON, DELIBERATELY.
                        A super admin can appoint and remove every other one, so
                        a hijacked super-admin session should not be able to mint
                        a second permanent way in with one click. Promotion is a
                        database statement somebody has to mean — see
                        docs/ADMIN_ACCESS.md. Removing access stays here, because
                        taking access away in a hurry is the thing you want to be
                        easy. */}
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
            );
          })}
        </div>
      )}

      {!isSuperAdmin && (
        <p className="text-content-muted text-xs">
          Only a super admin can invite, remove, or change what somebody can reach. Ask one of the
          people marked super admin above.
        </p>
      )}
    </div>
  );
}
