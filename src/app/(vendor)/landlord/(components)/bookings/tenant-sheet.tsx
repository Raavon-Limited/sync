'use client';

/**
 * One tenant, everything the landlord may know about them, and the two things
 * they can do.
 *
 * THE REMINDER USED TO BE A LIE. It set a boolean and popped "Reminder sent to
 * <name>"; nothing was sent. Worse than a dead button, because the landlord
 * came away believing they had chased somebody who had heard nothing. It calls
 * `send_rent_reminder` now, which notifies the student for real.
 *
 * AND IT WAS OFFERED ON A TENANT WHO HAD PAID, which is the one state where a
 * reminder is not merely useless but rude. There are exactly two conversations
 * worth having - "you have not paid" and "your lease is ending" - and the
 * button says which one it is about rather than being generically available.
 * The database refuses the other cases too; the disabled state is a courtesy,
 * not the rule.
 *
 * EMPTY ROWS ARE NOT RENDERED. `email` has returned '' for every tenant since
 * this was written (`profiles` has no email column - it lives on auth.users),
 * and `school` is empty for anyone who has not set a campus. Both were drawn as
 * an icon beside a blank space, which reads as data that failed to load rather
 * than data that was never there.
 *
 * THE ACTIONS SIT AT THE BOTTOM OF THE SHEET, not wherever the content happens
 * to end. With a short booking history they were floating in the middle of an
 * empty panel.
 */

import { type ReactNode, useState, useTransition } from 'react';
import {
  Sheet,
  SheetTrigger,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  Avatar,
  AvatarFallback,
  Button,
  Badge,
  toast,
} from '@/components/ui';
import { CalendarPlus, GraduationCap, Loader2, Mail, Phone, ShieldCheck } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { StatusBadge } from '../shared/status-badge';
import { formatDate, initials, type Tenant } from '../landlord-types';
import { grantLeaseGrace, sendRentReminder } from '@/modules/hostels/landlord-actions';
import { useActionRefresh } from '@/lib/query/use-action-refresh';
import { RenewalPanel } from '@/components/hostels/renewal-panel';

/** Matches `send_rent_reminder`: unpaid, or the lease is within 30 days of ending. */
const REMINDER_WINDOW_DAYS = 30;

function reminderReason(tenant: Tenant): 'unpaid' | 'expiring' | null {
  if (tenant.paymentStatus !== 'paid') return 'unpaid';
  if (!tenant.leaseEnd) return null;
  const days = (new Date(tenant.leaseEnd).getTime() - Date.now()) / 86_400_000;
  return days <= REMINDER_WINDOW_DAYS ? 'expiring' : null;
}

/** Today, as the yyyy-mm-dd a date input wants. */
function todayIso(): string {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
}

export function TenantSheet({ tenant, trigger }: { tenant: Tenant; trigger?: ReactNode }) {
  const router = useRouter();
  const refresh = useActionRefresh();

  const [busy, start] = useTransition();
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showGrace, setShowGrace] = useState(false);
  const [graceUntil, setGraceUntil] = useState(tenant.graceUntil ?? '');

  const reason = reminderReason(tenant);

  function remind() {
    setError(null);
    start(async () => {
      const res = await sendRentReminder(tenant.id);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setSent(true);
      toast.success(`Reminder sent to ${tenant.name}`);
      await refresh();
    });
  }

  function extend() {
    setError(null);
    start(async () => {
      const res = await grantLeaseGrace({ bookingId: tenant.id, until: graceUntil });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setShowGrace(false);
      toast.success(`${tenant.name} can stay until ${formatDate(graceUntil)}`);
      await refresh();
    });
  }

  return (
    <Sheet>
      <SheetTrigger asChild>
        {trigger ?? (
          <Button variant="outline" size="sm">
            View
          </Button>
        )}
      </SheetTrigger>
      <SheetContent side="right" className="flex w-full flex-col gap-6 overflow-y-auto sm:max-w-md">
        <SheetHeader>
          <SheetTitle>Tenant profile</SheetTitle>
          <SheetDescription>Booking and payment history</SheetDescription>
        </SheetHeader>

        <div className="flex items-center gap-3">
          <Avatar className="size-14">
            <AvatarFallback>{initials(tenant.name)}</AvatarFallback>
          </Avatar>
          <div className="flex flex-col gap-1">
            <span className="font-display text-lead">{tenant.name}</span>
            {tenant.studentVerified ? (
              <Badge variant="accent" className="w-fit gap-1">
                <ShieldCheck className="size-3" />
                Student verified
              </Badge>
            ) : (
              <Badge variant="muted" className="w-fit">
                Unverified
              </Badge>
            )}
          </div>
        </div>

        {/* Only the details we actually have. See the header. */}
        {(tenant.school || tenant.email || tenant.phone) && (
          <div className="flex flex-col gap-3 text-sm">
            {tenant.school && (
              <div className="text-content-muted flex items-center gap-2">
                <GraduationCap className="size-4 shrink-0" />
                <span>{tenant.school}</span>
              </div>
            )}
            {tenant.email && (
              <div className="text-content-muted flex items-center gap-2">
                <Mail className="size-4 shrink-0" />
                <span className="truncate">{tenant.email}</span>
              </div>
            )}
            {tenant.phone && (
              <div className="text-content-muted flex items-center gap-2">
                <Phone className="size-4 shrink-0" />
                <span>{tenant.phone}</span>
              </div>
            )}
          </div>
        )}

        <div className="border-line/10 border-t" />

        <div className="grid grid-cols-2 gap-4">
          <div className="flex flex-col gap-1">
            <span className="text-content-muted text-xs">Current property</span>
            <span className="text-sm font-medium">{tenant.property}</span>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-content-muted text-xs">Payment</span>
            <StatusBadge status={tenant.paymentStatus} />
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-content-muted text-xs">Move-in</span>
            <span className="text-sm font-medium">{formatDate(tenant.moveIn)}</span>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-content-muted text-xs">Lease ends</span>
            <span className="text-sm font-medium">
              {tenant.leaseEnd ? formatDate(tenant.leaseEnd) : 'Not set'}
            </span>
          </div>
          {/* Shown only when it exists, and worded so it cannot be mistaken for
              the lease itself - the lease still ended when it ended. */}
          {tenant.graceUntil && (
            <div className="col-span-2 flex flex-col gap-1">
              <span className="text-content-muted text-xs">Staying on until</span>
              <span className="text-accent-fg text-sm font-medium">
                {formatDate(tenant.graceUntil)} · extension you granted
              </span>
            </div>
          )}
        </div>

        {/* Keeping a good tenant is a decision with a deadline, so it sits
            with the dates it depends on rather than on another screen. Renders
            nothing until the term is close enough to decide. */}
        {tenant.paymentStatus === 'paid' && tenant.leaseEnd && (
          <RenewalPanel
            bookingId={tenant.id}
            side="landlord"
            endDate={tenant.leaseEnd}
            hostelName={tenant.property}
            renewal={tenant.renewal ?? null}
          />
        )}

        <div className="border-line/10 border-t" />

        <div className="flex flex-col gap-3">
          <span className="text-sm font-medium">Booking history</span>
          {tenant.bookingHistory.length === 0 ? (
            // Was a heading over nothing at all.
            <p className="text-content-muted text-xs">This is their first stay with you.</p>
          ) : (
            <div className="flex flex-col gap-2">
              {tenant.bookingHistory.map((b, i) => (
                <div
                  key={i}
                  className="border-line/10 flex items-center justify-between rounded-lg border p-3 text-sm"
                >
                  <span className="font-medium">{b.property}</span>
                  <span className="text-content-muted">{b.period}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* mt-auto: the actions belong at the foot of the panel, not wherever
            the history happened to stop. */}
        <div className="mt-auto flex flex-col gap-3 pt-4">
          {showGrace && (
            <div className="border-line/15 flex flex-col gap-2 rounded-xl border p-3">
              <label className="flex flex-col gap-1">
                <span className="text-content-muted text-[10px] font-bold tracking-widest uppercase">
                  Let them stay until
                </span>
                <input
                  type="date"
                  value={graceUntil}
                  min={todayIso()}
                  onChange={(e) => setGraceUntil(e.target.value)}
                  className="border-line/15 bg-surface-deep text-content rounded-lg border px-3 py-2 text-sm"
                />
              </label>
              <p className="text-content-muted text-[11px] leading-relaxed">
                Up to three months past{' '}
                {tenant.leaseEnd ? formatDate(tenant.leaseEnd) : 'the lease end'}. This is an
                extension, not a new lease - no rent is charged for it.
              </p>
              <div className="flex gap-2">
                <Button variant="outline" className="flex-1" onClick={() => setShowGrace(false)}>
                  Cancel
                </Button>
                <Button className="flex-1" disabled={busy || !graceUntil} onClick={extend}>
                  {busy && <Loader2 className="size-4 animate-spin" />}
                  Confirm
                </Button>
              </div>
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            {/* Offered only when there is something to remind them ABOUT, and
                the label says which. */}
            {reason && (
              <Button className="flex-1" disabled={busy || sent} onClick={remind}>
                {busy && <Loader2 className="size-4 animate-spin" />}
                {sent
                  ? 'Reminder sent'
                  : reason === 'unpaid'
                    ? 'Remind about payment'
                    : 'Remind about renewal'}
              </Button>
            )}

            {/* Grace is for a paid tenancy with an end date; there is nothing
                to extend otherwise. */}
            {tenant.paymentStatus === 'paid' && tenant.leaseEnd && !showGrace && (
              <Button variant="outline" onClick={() => setShowGrace(true)}>
                <CalendarPlus className="size-4" aria-hidden="true" />
                {tenant.graceUntil ? 'Change extension' : 'Extend stay'}
              </Button>
            )}

            <Button
              variant="outline"
              onClick={() =>
                router.push(`/landlord/inbox?tenantId=${encodeURIComponent(tenant.id)}`)
              }
            >
              Message
            </Button>
          </div>

          {/* Says why, rather than leaving a landlord wondering where the
              button went. */}
          {!reason && (
            <p className="text-content-muted text-[11px]">
              Nothing to chase - the rent is paid and the lease is not near its end.
            </p>
          )}

          {error && <p className="text-coral text-xs">{error}</p>}
        </div>
      </SheetContent>
    </Sheet>
  );
}
