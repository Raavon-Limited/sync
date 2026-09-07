'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { ShieldOff, ArchiveRestore } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { toast } from '@/components/ui/toast';
import { restoreAccount, purgeAccount } from '@/modules/account/actions';
import type { EnrichedUser } from './UsersClient';
import { avatarColors, initials, statusBadge, formatRole, formatDate } from './Userutils';

type Props = {
  user: EnrichedUser;
  isSuperAdmin: boolean;
  onClose: () => void;
  onPatch: (id: string, patch: Partial<EnrichedUser>) => void;
  onRemove: (id: string) => void;
};

export function UserDetailModal({ user: u, isSuperAdmin, onClose, onPatch, onRemove }: Props) {
  const router = useRouter();
  const [purgeOpen, setPurgeOpen] = useState(false);
  const [pending, start] = useTransition();
  const archived = Boolean(u.archived_at);
  const [bg, fg] = avatarColors(u.full_name ?? '');

  function restore() {
    start(async () => {
      const res = await restoreAccount(u.id);
      if (res.ok) {
        onPatch(u.id, { archived_at: null });
        toast('Account restored.');
      } else toast(res.error);
      router.refresh();
    });
  }

  function purge() {
    start(async () => {
      const res = await purgeAccount(u.id);
      if (res.ok) {
        onRemove(u.id);
        toast('Account purged.');
        onClose();
      } else toast(res.error);
      setPurgeOpen(false);
      router.refresh();
    });
  }

  return (
    <>
      {/* THE SHARED SHEET, NOT A HAND-ROLLED ONE.

          This panel used to be its own fixed overlay plus a fixed z-50 div,
          rendered inline in the page. DashboardShell wraps every dashboard
          page in `<main className="relative isolate">` for the doodle
          backdrop, and `isolate` makes a stacking context   so z-50 here was
          50 INSIDE main, and the panel slid under the header no matter how
          high the number went. Raising it could not have worked.

          ui/sheet is Radix, which portals to <body>, so it escapes the
          isolate entirely, and brings the focus trap, the Esc key, the scroll
          lock and the labelled title with it. It is what every other drawer on
          the platform already uses. */}
      <Sheet
        open
        onOpenChange={(next) => {
          if (!next) onClose();
        }}
      >
        <SheetContent
          side="right"
          aria-describedby={undefined}
          className="flex w-full flex-col gap-0 overflow-y-auto p-0 sm:w-full sm:max-w-lg"
        >
          {/* ── Header ── */}
          <div className="border-line/10 flex items-start justify-between border-b p-5">
            <div className="flex items-center gap-4">
              <div
                className="font-display flex h-14 w-14 shrink-0 items-center justify-center rounded-full text-lg font-bold"
                style={{ background: bg, color: fg }}
              >
                {initials(u.full_name)}
              </div>
              <div>
                <SheetTitle className="font-display text-content text-xl font-bold">
                  {u.full_name ?? ' '}
                </SheetTitle>
                <p className="text-content-muted mt-0.5 text-sm capitalize">
                  {formatRole(u.role)}
                  {u.vendor_category ? ` · ${u.vendor_category}` : ''}
                </p>
                <div className="mt-1.5">{statusBadge(u)}</div>
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-5 p-5">
            {/* ── Actions ── */}
            <div className="flex flex-wrap gap-2">
              {archived ? (
                <Button size="sm" variant="outline" disabled={pending} onClick={restore}>
                  <ArchiveRestore className="h-3.5 w-3.5" /> Restore Account
                </Button>
              ) : (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={pending}
                  className="border-coral/30 text-coral hover:bg-coral/10"
                  onClick={() => {
                    onPatch(u.id, { archived_at: new Date().toISOString() });
                    toast('Account deactivated.');
                  }}
                >
                  <ShieldOff className="h-3.5 w-3.5" /> Deactivate
                </Button>
              )}
            </div>

            {/* ── Stats row ── */}
            <div className="grid grid-cols-3 gap-3">
              {[
                { label: 'Total Spent', value: ' ' },
                { label: 'Total Orders', value: ' ' },
                {
                  label: 'Member Since',
                  value: new Date(u.created_at)
                    .toLocaleDateString('en-NG', { month: 'short', year: 'numeric' })
                    .toUpperCase(),
                },
              ].map(({ label, value }) => (
                <div key={label} className="border-line/10 bg-surface-deep rounded-xl border p-3">
                  <p className="text-content-muted mb-1 text-[0.6rem] font-bold tracking-wider uppercase">
                    {label}
                  </p>
                  <p className="font-display text-content text-base font-bold">{value}</p>
                </div>
              ))}
            </div>

            {/* ── Account Information ── */}
            <div className="border-line/10 rounded-xl border p-4">
              <p className="font-display text-content mb-4 font-bold">Account Information</p>
              <dl className="divide-line/10 divide-y">
                {[
                  { label: 'Email Address', value: u.email },
                  { label: 'Location', value: 'Nigeria' },
                  {
                    label: 'Account Type',
                    value:
                      formatRole(u.role).charAt(0).toUpperCase() +
                      formatRole(u.role).slice(1) +
                      (u.vendor_category ? `   ${u.vendor_category}` : ''),
                  },
                  { label: 'Joined', value: formatDate(u.created_at) },
                  { label: 'Verification', value: u.verification_status },
                ].map(({ label, value }) => (
                  <div
                    key={label}
                    className="flex items-start justify-between gap-4 py-2.5 first:pt-0 last:pb-0"
                  >
                    <dt className="text-content-muted w-28 shrink-0 text-[0.7rem] font-bold tracking-wider uppercase">
                      {label}
                    </dt>
                    <dd className="text-content text-right text-sm capitalize">{value}</dd>
                  </div>
                ))}
              </dl>
            </div>

            {/* ── Access & Roles ── */}
            <div className="border-line/10 rounded-xl border p-4">
              <p className="font-display text-content mb-3 font-bold">Access & Roles</p>
              <div className="flex flex-wrap gap-2">
                <span className="border-line/15 bg-surface-deep text-content rounded-lg border px-3 py-1.5 text-sm capitalize">
                  {formatRole(u.role)}
                </span>
                {u.vendor_category && (
                  <span className="border-line/15 bg-surface-deep text-content rounded-lg border px-3 py-1.5 text-sm">
                    {u.vendor_category}
                  </span>
                )}
              </div>
            </div>

            {/* ── Danger Zone (super_admin only) ── */}
            {isSuperAdmin && (
              <div className="border-coral/20 bg-coral/5 rounded-xl border p-4">
                <p className="font-display text-coral mb-1 text-sm font-bold">Danger Zone</p>
                <p className="text-content-muted mb-3 text-xs">
                  Permanent removal cannot be undone.
                </p>
                <Button
                  size="sm"
                  variant="outline"
                  className="border-coral/30 text-coral hover:bg-coral/10"
                  onClick={() => setPurgeOpen(true)}
                >
                  Purge account permanently
                </Button>
              </div>
            )}
          </div>
        </SheetContent>
      </Sheet>

      <ConfirmDialog
        open={purgeOpen}
        onOpenChange={setPurgeOpen}
        title="Purge this account?"
        description={`This permanently removes ${u.full_name ?? 'this account'} and all associated data. This cannot be undone.`}
        confirmLabel="Purge permanently"
        destructive
        loading={pending}
        onConfirm={purge}
      />
    </>
  );
}
