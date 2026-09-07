/**
 * Building a role: name it, then say what it can reach and whether it can act.
 *
 * A GRID, NOT A LIST OF CHECKBOXES
 *   The question is two-dimensional   area by level   and a flat list of
 *   "Disputes: read" / "Disputes: write" tickboxes makes people work out for
 *   themselves that ticking both is the same as ticking one. Three exclusive
 *   buttons per row says it once.
 *
 * EVERY AREA IS SHOWN, INCLUDING THE UNGRANTED ONES
 *   A role's shape is as much what it CANNOT do, and an editor that only listed
 *   granted areas would hide exactly the rows somebody is looking for. The list
 *   comes from modules/access/areas, not from the grants.
 *
 * SAVED ON THE CLICK, NOT BEHIND A SAVE BUTTON
 *   Each cell is one call. A form with fifteen rows and a Save at the bottom
 *   invites somebody to change six things, lose the tab, and never know which
 *   of them took.
 */
'use client';

import { useState, useTransition } from 'react';
import { Loader2, Plus, ShieldCheck } from 'lucide-react';
import { Badge, Button, Input } from '@/components/ui';
import { cn } from '@/lib/utils';
import { createAccessRole, setRoleGrant } from '@/modules/admin/actions';
import { ADMIN_AREAS, type AccessLevel } from '@/modules/access/areas';
import type { AccessRole } from '@/modules/admin/roles';

const LEVELS: { value: AccessLevel; label: string; hint: string }[] = [
  { value: 'none', label: 'No access', hint: 'Cannot open it' },
  { value: 'read', label: 'Read', hint: 'Can look, cannot act' },
  { value: 'write', label: 'Read & write', hint: 'Can act' },
];

export function RolesConsole({ roles, canManage }: { roles: AccessRole[]; canManage: boolean }) {
  const [busy, startTransition] = useTransition();
  const [name, setName] = useState('');
  const [openRole, setOpenRole] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<string | null>(null);

  function run(fn: () => Promise<unknown>, key?: string) {
    setError(null);
    setPending(key ?? null);
    startTransition(async () => {
      try {
        await fn();
      } catch (e) {
        setError(e instanceof Error ? e.message : 'That did not go through.');
      } finally {
        setPending(null);
      }
    });
  }

  return (
    <div className="flex flex-col gap-4">
      {canManage && (
        <div className="border-line/10 bg-panel flex flex-wrap items-center gap-2 rounded-xl border p-4">
          <Plus className="text-content-muted size-4 shrink-0" aria-hidden="true" />
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Role name   Reviewer, Support, Finance…"
            className="min-w-0 flex-1"
          />
          <Button
            disabled={busy || !name.trim()}
            onClick={() =>
              run(async () => {
                await createAccessRole({ name });
                setName('');
              }, 'create')
            }
          >
            {pending === 'create' && <Loader2 className="animate-spin" aria-hidden="true" />}
            Create role
          </Button>
          <p className="text-content-muted w-full text-xs">
            A new role starts with no access at all. Open it and grant the areas it needs.
          </p>
        </div>
      )}

      {error && (
        <p className="text-coral border-coral/30 bg-coral/5 rounded-lg border px-3 py-2 text-sm">
          {error}
        </p>
      )}

      <div className="flex flex-col gap-3">
        {roles.map((role) => {
          const open = openRole === role.id;
          const granted = Object.keys(role.grants).length;

          return (
            <div key={role.id} className="border-line/10 bg-panel flex flex-col rounded-xl border">
              <button
                type="button"
                onClick={() => setOpenRole(open ? null : role.id)}
                aria-expanded={open}
                className="flex cursor-pointer items-start gap-3 p-4 text-left"
              >
                <ShieldCheck
                  className="text-content-muted mt-0.5 size-4 shrink-0"
                  aria-hidden="true"
                />
                <div className="min-w-0 flex-1">
                  <p className="text-content flex flex-wrap items-center gap-2 font-medium">
                    {role.name}
                    {role.isSystem && (
                      <Badge className="bg-ink/5 text-content-muted">built in</Badge>
                    )}
                  </p>
                  <p className="text-content-muted text-xs">
                    {role.description ? `${role.description} · ` : ''}
                    {granted === 0
                      ? 'No areas granted'
                      : `${granted} of ${ADMIN_AREAS.length} areas`}
                    {' · '}
                    {role.members.length === 0
                      ? 'nobody assigned'
                      : role.members.map((m) => m.name).join(', ')}
                  </p>
                </div>
              </button>

              {open && (
                <div className="border-line/10 divide-line/10 divide-y border-t">
                  {role.isSystem && (
                    <p className="text-content-muted px-4 py-3 text-xs">
                      Built-in roles cannot be edited   removing an area from this one would take it
                      from everybody holding it at once. Make a new role instead.
                    </p>
                  )}

                  {ADMIN_AREAS.map((area) => {
                    const level: AccessLevel = role.grants[area.key] ?? 'none';
                    return (
                      <div key={area.key} className="flex flex-wrap items-center gap-3 px-4 py-3">
                        <div className="min-w-[12rem] flex-1">
                          <p className="text-content text-sm font-medium">{area.label}</p>
                          <p className="text-content-muted text-xs">{area.description}</p>
                        </div>

                        <div className="border-line/10 flex shrink-0 rounded-lg border p-0.5">
                          {LEVELS.map((l) => {
                            const active = level === l.value;
                            const key = `${role.id}:${area.key}`;
                            return (
                              <button
                                key={l.value}
                                type="button"
                                title={l.hint}
                                disabled={busy || !canManage || role.isSystem}
                                aria-pressed={active}
                                onClick={() =>
                                  run(
                                    () =>
                                      setRoleGrant({
                                        roleId: role.id,
                                        area: area.key,
                                        level: l.value === 'none' ? null : l.value,
                                      }),
                                    key,
                                  )
                                }
                                className={cn(
                                  'cursor-pointer rounded-md px-3 py-1.5 text-xs transition-colors',
                                  active
                                    ? 'bg-lime/15 text-lime-deep font-medium'
                                    : 'text-content-muted hover:text-content',
                                  (!canManage || role.isSystem) && 'cursor-not-allowed opacity-60',
                                )}
                              >
                                {pending === key && active ? '…' : l.label}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {!canManage && (
        <p className="text-content-muted text-xs">Only a super admin can create or change roles.</p>
      )}
    </div>
  );
}
