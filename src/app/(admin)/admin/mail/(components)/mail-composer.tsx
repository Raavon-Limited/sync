/**
 * Writing the message, choosing who gets it, and seeing what already went.
 *
 * THREE AUDIENCES, NOT A QUERY BUILDER
 *   Everyone, a role, or a hand-picked list. Those are the three things staff
 *   actually want, and each extra dimension (verified only, joined since, has
 *   an order) is a filter somebody has to reason about correctly under a Send
 *   button that cannot be recalled. The picked list is searchable, which covers
 *   the long tail without inventing a language for it.
 *
 * THE COUNT IS ALWAYS ON SCREEN
 *   Beside the button, in the button's own sentence. The single worst outcome
 *   here is somebody meaning "these two" and sending to four hundred, and the
 *   defence against it is that the number never leaves their eye.
 *
 * NOTHING SENDS WITHOUT A SECOND CLICK when it reaches more than a handful.
 *   A confirm step for a mailshot is not friction, it is the last point at
 *   which a mistake costs nothing.
 *
 * IT REPORTS WHAT ACTUALLY HAPPENED. Sent, failed, notified   three numbers,
 * because a provider that accepts 96 of 100 has not failed and has not
 * succeeded, and one boolean cannot say so.
 */
'use client';

import { useMemo, useState, useTransition } from 'react';
import { Mail, Bell, Search } from 'lucide-react';
import { Badge, Button, Input } from '@/components/ui';
import { cn, formatRelative } from '@/lib/utils';
import { sendBroadcast, type Audience } from '@/modules/admin/broadcast-actions';
import type { SentRow } from '../page';

export interface Recipient {
  id: string;
  name: string;
  role: string;
  /** Null when the account has no address   they can still be notified. */
  email: string | null;
}

type Mode = 'all' | 'roles' | 'ids';

const ROLE_LABEL: Record<string, string> = {
  student: 'Students',
  vendor: 'Vendors',
  landlord: 'Landlords',
  rider: 'Riders',
  event_manager: 'Event organisers',
  creator: 'Content creators',
  admin: 'Admins',
  super_admin: 'Super admins',
};

export function MailComposer({ recipients, sent }: { recipients: Recipient[]; sent: SentRow[] }) {
  const [mode, setMode] = useState<Mode>('ids');
  const [roles, setRoles] = useState<string[]>([]);
  const [ids, setIds] = useState<string[]>([]);
  const [search, setSearch] = useState('');

  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [ctaLabel, setCtaLabel] = useState('');
  const [ctaPath, setCtaPath] = useState('');
  const [byEmail, setByEmail] = useState(true);
  const [byNotification, setByNotification] = useState(true);

  const [confirming, setConfirming] = useState(false);
  const [busy, startSending] = useTransition();
  const [result, setResult] = useState<null | {
    ok: boolean;
    text: string;
    errors: string[];
  }>(null);

  const rolesPresent = useMemo(
    () => [...new Set(recipients.map((r) => r.role))].sort(),
    [recipients],
  );

  // Resolved in the browser from the same list the action resolves on the
  // server. It is a preview, not the authority   the action counts again.
  const chosen = useMemo(() => {
    if (mode === 'all') return recipients;
    if (mode === 'roles') return recipients.filter((r) => roles.includes(r.role));
    return recipients.filter((r) => ids.includes(r.id));
  }, [mode, roles, ids, recipients]);

  const withoutEmail = chosen.filter((r) => !r.email).length;

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return recipients.slice(0, 50);
    return recipients
      .filter(
        (r) =>
          r.name.toLowerCase().includes(q) ||
          (r.email ?? '').toLowerCase().includes(q) ||
          r.role.includes(q),
      )
      .slice(0, 50);
  }, [recipients, search]);

  function audience(): Audience {
    if (mode === 'all') return { mode: 'all' };
    if (mode === 'roles') return { mode: 'roles', roles };
    return { mode: 'ids', ids };
  }

  function send() {
    setResult(null);
    startSending(async () => {
      const res = await sendBroadcast({
        subject,
        body,
        audience: audience(),
        email: byEmail,
        notify: byNotification,
        ctaLabel,
        ctaPath,
      });

      setConfirming(false);
      setResult({
        ok: res.ok,
        text: `${res.sent} email${res.sent === 1 ? '' : 's'} sent, ${res.notified} notified${
          res.failed ? `, ${res.failed} failed` : ''
        }.`,
        errors: res.errors,
      });

      if (res.ok) {
        setSubject('');
        setBody('');
        setCtaLabel('');
        setCtaPath('');
      }
    });
  }

  const chip = (active: boolean) =>
    cn(
      'cursor-pointer rounded-full border px-3 py-1 text-xs transition-colors',
      active
        ? 'border-lime-deep/40 bg-lime/10 text-lime-deep'
        : 'border-line/10 text-content-muted hover:text-content',
    );

  return (
    <div className="flex flex-col gap-6">
      <div className="border-line/10 bg-panel flex flex-col gap-4 rounded-xl border p-4">
        <div className="flex flex-col gap-2">
          <span className="text-content-muted text-[11px] tracking-wide uppercase">
            Who gets it
          </span>
          <div className="flex flex-wrap gap-2">
            {(
              [
                ['ids', 'Chosen accounts'],
                ['roles', 'By role'],
                ['all', 'Everyone'],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() => setMode(value)}
                className={chip(mode === value)}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {mode === 'roles' && (
          <div className="flex flex-wrap gap-2">
            {rolesPresent.map((r) => (
              <button
                key={r}
                type="button"
                onClick={() =>
                  setRoles((prev) =>
                    prev.includes(r) ? prev.filter((x) => x !== r) : [...prev, r],
                  )
                }
                className={chip(roles.includes(r))}
              >
                {ROLE_LABEL[r] ?? r}
                <span className="ml-1.5 opacity-60">
                  {recipients.filter((p) => p.role === r).length}
                </span>
              </button>
            ))}
          </div>
        )}

        {mode === 'ids' && (
          <div className="flex flex-col gap-2">
            <div className="relative">
              <Search className="text-content-muted absolute top-1/2 left-3 size-4 -translate-y-1/2" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by name, email or role…"
                className="pl-9"
              />
            </div>
            <div className="border-line/10 divide-line/10 max-h-64 divide-y overflow-y-auto rounded-lg border">
              {visible.map((r) => (
                <label
                  key={r.id}
                  className="hover:bg-ink/5 flex cursor-pointer items-center gap-3 px-3 py-2"
                >
                  <input
                    type="checkbox"
                    className="accent-lime-deep"
                    checked={ids.includes(r.id)}
                    onChange={(e) =>
                      setIds((prev) =>
                        e.target.checked ? [...prev, r.id] : prev.filter((x) => x !== r.id),
                      )
                    }
                  />
                  <span className="min-w-0 flex-1">
                    <span className="text-content block truncate text-sm">{r.name}</span>
                    <span className="text-content-muted block truncate text-xs">
                      {r.email ?? 'No email on file'} · {ROLE_LABEL[r.role] ?? r.role}
                    </span>
                  </span>
                </label>
              ))}
              {visible.length === 0 && (
                <p className="text-content-muted px-3 py-4 text-center text-sm">
                  Nobody matches that.
                </p>
              )}
            </div>
          </div>
        )}

        <p className="text-content-muted text-xs">
          {chosen.length} account{chosen.length === 1 ? '' : 's'} selected
          {withoutEmail > 0 && byEmail && (
            <span className="text-coral">
              {' · '}
              {withoutEmail} with no email address — they can only be notified in the app
            </span>
          )}
        </p>
      </div>

      <div className="border-line/10 bg-panel flex flex-col gap-3 rounded-xl border p-4">
        <span className="text-content-muted text-[11px] tracking-wide uppercase">The message</span>

        <Input
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          placeholder="Subject — also the heading in the email and the title of the notification"
        />

        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={8}
          placeholder={'Write it plainly.\n\nA blank line starts a new paragraph.'}
          className="border-line/15 bg-surface-deep text-content placeholder:text-content-muted/60 rounded-lg border px-3 py-2 text-sm"
        />

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Input
            value={ctaLabel}
            onChange={(e) => setCtaLabel(e.target.value)}
            placeholder="Button label (optional)"
          />
          <Input
            value={ctaPath}
            onChange={(e) => setCtaPath(e.target.value)}
            placeholder="Where it goes, e.g. /me/verify"
          />
        </div>

        <div className="flex flex-wrap gap-4">
          <label className="text-content-muted flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              className="accent-lime-deep"
              checked={byEmail}
              onChange={(e) => setByEmail(e.target.checked)}
            />
            <Mail className="size-4" /> Send by email
          </label>
          <label className="text-content-muted flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              className="accent-lime-deep"
              checked={byNotification}
              onChange={(e) => setByNotification(e.target.checked)}
            />
            {/* The bell is realtime, so this arrives while they are looking at
                the app rather than the next time they load it. */}
            <Bell className="size-4" /> Pop up in the app
          </label>
        </div>

        {/* THE SECOND CLICK. Anything past a handful of people gets one, and it
            names the number rather than asking "are you sure" about nothing. */}
        {confirming ? (
          <div className="border-coral/30 bg-coral/5 flex flex-wrap items-center gap-3 rounded-lg border p-3">
            <p className="text-content flex-1 text-sm">
              Send to {chosen.length} account{chosen.length === 1 ? '' : 's'}? This cannot be
              recalled.
            </p>
            <Button disabled={busy} onClick={send}>
              {busy ? 'Sending…' : 'Yes, send it'}
            </Button>
            <Button variant="outline" disabled={busy} onClick={() => setConfirming(false)}>
              Cancel
            </Button>
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-3">
            <Button
              disabled={busy || chosen.length === 0 || !subject.trim() || !body.trim()}
              onClick={() => (chosen.length > 3 ? setConfirming(true) : send())}
            >
              Send to {chosen.length} account{chosen.length === 1 ? '' : 's'}
            </Button>
            {chosen.length === 0 && (
              <span className="text-content-muted text-xs">Choose who gets it first.</span>
            )}
          </div>
        )}

        {result && (
          <div
            className={cn(
              'rounded-lg border px-3 py-2 text-sm',
              result.ok
                ? 'border-emerald-500/30 bg-emerald-500/5 text-emerald-600'
                : 'border-coral/30 bg-coral/5 text-coral',
            )}
          >
            <p>{result.text}</p>
            {result.errors.map((e) => (
              <p key={e} className="mt-1 text-xs">
                {e}
              </p>
            ))}
          </div>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <span className="text-content-muted text-[11px] tracking-wide uppercase">
          Recently sent
        </span>
        {sent.length === 0 ? (
          <p className="text-content-muted border-line/10 rounded-xl border border-dashed p-6 text-center text-sm">
            Nothing has been sent yet.
          </p>
        ) : (
          <div className="border-line/10 divide-line/10 divide-y rounded-xl border">
            {sent.map((s) => (
              <div key={s.id} className="flex flex-wrap items-center gap-3 px-4 py-2.5">
                <div className="min-w-0 flex-1">
                  <p className="text-content truncate text-sm">{s.subject}</p>
                  <p className="text-content-muted truncate text-xs">
                    {s.email}
                    {s.sentBy ? ` · by ${s.sentBy}` : ' · automatic'}
                  </p>
                </div>
                <Badge className="bg-ink/5 text-content-muted">{s.kind.replace(/_/g, ' ')}</Badge>
                <span className="text-content-muted text-xs">{formatRelative(s.createdAt)}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
