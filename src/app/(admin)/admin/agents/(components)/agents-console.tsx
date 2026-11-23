/**
 * Inviting an agent, and sending one somewhere.
 *
 * THE LINK IS SHOWN EVEN WHEN THE EMAIL WENT
 *   Emailing it is the feature and the copyable link is the fallback   for a
 *   misconfigured provider, for an address that bounces, and for the very
 *   ordinary case of an agent standing next to you who would rather you sent
 *   it on WhatsApp. Hiding it on success would be hiding the recovery path at
 *   exactly the moment it is cheapest to use.
 *
 * ASSIGNING NAMES THE CONSEQUENCE
 *   The button says what happens to somebody else   the landlord or vendor is
 *   told, by name, the moment it is pressed. That is not a detail to discover
 *   afterwards from a support message asking who the stranger at the gate was.
 */
'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { ChevronRight, Copy, MapPin, Send, UserPlus } from 'lucide-react';
import { Badge, Button, Input, Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui';
import { cn } from '@/lib/utils';
import { useRouter } from 'next/navigation';
import {
  inviteAgent,
  resendAgentInvite,
  revokeAgentInvite,
  assignVisit,
} from '@/modules/agents/actions';

export interface AgentRow {
  id: string;
  /** `full_name`, else the account email. Never a placeholder in practice. */
  name: string;
  /** From auth   `profiles` has no email column. Null only if auth had none. */
  email: string | null;
  /** False when `name` IS the email, so the row does not print it twice. */
  hasName: boolean;
  suspended: boolean;
  /** From their profile. Null when they never picked one. */
  campus: string | null;
  /** Areas they have actually been sent to, most-worked first. */
  areas: string[];
  joinedAt: string | null;
  lastSeenAt: string | null;
  /** Visits assigned and not yet decided. */
  open: number;
  /** Visits they have sent evidence for. */
  submitted: number;
  /** Visits a reviewer has closed either way. */
  decided: number;
}

export interface InviteRow {
  id: string;
  email: string;
  invitedBy: string;
  expiresAt: string;
}

export interface PlaceRow {
  id: string;
  kind: 'hostel' | 'vendor';
  label: string;
  detail: string;
}

export function AgentsConsole({
  agents,
  invites,
  places,
}: {
  agents: AgentRow[];
  invites: InviteRow[];
  places: PlaceRow[];
}) {
  const [email, setEmail] = useState('');
  const [link, setLink] = useState<string | null>(null);
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);
  const [inviting, startInvite] = useTransition();

  const [agentId, setAgentId] = useState('');
  const [placeKey, setPlaceKey] = useState('');
  const [when, setWhen] = useState('');
  const [brief, setBrief] = useState('');
  const [assigning, startAssign] = useTransition();
  const [assignNote, setAssignNote] = useState<{ ok: boolean; text: string } | null>(null);

  const router = useRouter();
  /** Which invite row is mid-action, so only its own buttons go quiet. */
  const [busyInvite, setBusyInvite] = useState<string | null>(null);
  const [inviteNote, setInviteNote] = useState<{ ok: boolean; text: string } | null>(null);

  function resend(id: string, email: string) {
    setInviteNote(null);
    setBusyInvite(id);
    startInvite(async () => {
      const res = await resendAgentInvite(id);
      setBusyInvite(null);
      if (!res.ok) {
        setInviteNote({ ok: false, text: res.error });
        return;
      }
      // The old link is dead now, so the new one replaces it in the box above
      // rather than leaving a copyable link that no longer works.
      setLink(res.link);
      setInviteNote({
        ok: res.emailed,
        text: res.emailed
          ? `Sent again to ${email}. The previous link stopped working.`
          : `New link created, but the email did not send: ${res.emailError ?? 'unknown reason'}. Copy it below.`,
      });
      router.refresh();
    });
  }

  function cancelInvite(id: string, email: string) {
    setInviteNote(null);
    setBusyInvite(id);
    startInvite(async () => {
      const res = await revokeAgentInvite(id);
      setBusyInvite(null);
      setInviteNote(
        res.ok
          ? { ok: true, text: `Invitation to ${email} cancelled. Its link no longer works.` }
          : { ok: false, text: res.error },
      );
      // WAS FIRE-AND-FORGET. `revokeAgentInvite(i.id)` was called straight from
      // onClick with nothing awaiting it, so a failure was silent and a success
      // left the cancelled row on screen until the page was reloaded by hand.
      if (res.ok) router.refresh();
    });
  }

  function invite() {
    setNote(null);
    setLink(null);
    startInvite(async () => {
      const res = await inviteAgent({ email });
      if (!res.ok) {
        setNote({ ok: false, text: res.error });
        return;
      }
      setLink(res.link);
      setEmail('');
      setNote({
        ok: res.emailed,
        text: res.emailed
          ? 'Invited. The link is below as well, in case they want it another way.'
          : `Invite created, but the email did not send: ${res.emailError ?? 'unknown reason'}. Send them the link below.`,
      });
    });
  }

  function assign() {
    setAssignNote(null);
    const place = places.find((p) => `${p.kind}:${p.id}` === placeKey);
    if (!agentId || !place) {
      setAssignNote({ ok: false, text: 'Choose an agent and a place.' });
      return;
    }
    startAssign(async () => {
      const res = await assignVisit({
        agentId,
        hostelId: place.kind === 'hostel' ? place.id : null,
        vendorId: place.kind === 'vendor' ? place.id : null,
        scheduledFor: when ? new Date(when).toISOString() : null,
        brief,
      });
      setAssignNote(
        res.ok
          ? { ok: true, text: 'Assigned. The agent and the owner have both been told.' }
          : { ok: false, text: res.error },
      );
      if (res.ok) {
        setPlaceKey('');
        setWhen('');
        setBrief('');
      }
    });
  }

  const field =
    'border-line/15 bg-surface-deep text-content rounded-lg border px-3 py-2 text-sm w-full';

  const active = agents.filter((a) => !a.suspended);

  return (
    <Tabs defaultValue="assign" className="flex flex-col gap-4">
      {/*
        THREE TABS, BECAUSE THERE ARE THREE JOBS.
        Everything used to be one column, so the roster - the answer to "who
        have I actually got?" - was below an invite form and a link box and was
        the last thing on the page. The counts are on the triggers so the
        question is answered before the tab is opened.
      */}
      <TabsList>
        <TabsTrigger value="assign">Assign a visit</TabsTrigger>
        <TabsTrigger value="agents">Agents ({active.length})</TabsTrigger>
        <TabsTrigger value="invites">Invites ({invites.length})</TabsTrigger>
      </TabsList>

      <TabsContent value="assign" className="flex flex-col gap-6">
      {/* ── Send one somewhere ── */}
      <div className="border-line/10 bg-panel flex flex-col gap-3 rounded-xl border p-4">
        <p className="text-content flex items-center gap-2 text-sm font-medium">
          <Send className="size-4" /> Assign a visit
        </p>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <select value={agentId} onChange={(e) => setAgentId(e.target.value)} className={field}>
            <option value="">Choose an agent…</option>
            {active.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name} · {a.open} open
                {a.areas.length > 0 ? " · " + a.areas.slice(0, 2).join(", ") : ""}
              </option>
            ))}
          </select>

          <select value={placeKey} onChange={(e) => setPlaceKey(e.target.value)} className={field}>
            <option value="">Choose a place…</option>
            <optgroup label="Hostels with no visit yet">
              {places
                .filter((p) => p.kind === 'hostel')
                .map((p) => (
                  <option key={`hostel:${p.id}`} value={`hostel:${p.id}`}>
                    {p.label} · {p.detail}
                  </option>
                ))}
            </optgroup>
            <optgroup label="Businesses">
              {places
                .filter((p) => p.kind === 'vendor')
                .map((p) => (
                  <option key={`vendor:${p.id}`} value={`vendor:${p.id}`}>
                    {p.label} · {p.detail}
                  </option>
                ))}
            </optgroup>
          </select>

          <input
            type="datetime-local"
            value={when}
            onChange={(e) => setWhen(e.target.value)}
            className={field}
          />

          <Input
            value={brief}
            onChange={(e) => setBrief(e.target.value)}
            placeholder="Which gate, who to ask for, what to photograph"
          />
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <Button disabled={assigning} onClick={assign}>
            {assigning ? 'Assigning…' : 'Assign and notify'}
          </Button>
          {/* Said before the click, not discovered after it. */}
          <span className="text-content-muted text-xs">
            The owner is told who is coming, by name. Leave the time blank and they are told the
            agent will arrange it.
          </span>
        </div>

        {assignNote && (
          <p className={cn('text-xs', assignNote.ok ? 'text-accent-fg' : 'text-coral')}>
            {assignNote.text}
          </p>
        )}
      </div>

      </TabsContent>

      <TabsContent value="invites" className="flex flex-col gap-6">
      {/* ── Invite one ── */}
      <div className="border-line/10 bg-panel flex flex-col gap-3 rounded-xl border p-4">
        <p className="text-content flex items-center gap-2 text-sm font-medium">
          <UserPlus className="size-4" /> Invite an agent
        </p>
        <div className="flex flex-wrap gap-3">
          <Input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="their@email.com"
            className="max-w-xs"
          />
          <Button variant="outline" disabled={inviting || !email.trim()} onClick={invite}>
            {inviting ? 'Inviting…' : 'Send invite'}
          </Button>
        </div>
        <p className="text-content-muted text-xs">
          They set their own password from the link. It expires in 3 days and works once. There is
          no other way to become an agent.
        </p>

        {note && (
          <p className={cn('text-xs', note.ok ? 'text-accent-fg' : 'text-coral')}>{note.text}</p>
        )}

        {link && (
          <div className="border-line/15 bg-surface-deep flex flex-wrap items-center gap-2 rounded-lg border p-2">
            <code className="text-content-muted min-w-0 flex-1 truncate text-xs">{link}</code>
            <Button
              variant="ghost"
              onClick={() => {
                navigator.clipboard?.writeText(link).catch(() => {});
              }}
            >
              <Copy className="size-4" /> Copy
            </Button>
          </div>
        )}
      </div>

      {/* ── Who is outstanding ── */}
      {invites.length === 0 ? (
        <p className="text-content-muted border-line/10 rounded-xl border border-dashed p-6 text-center text-sm">
          No invites are outstanding. Everyone invited has either accepted or been cancelled.
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          <span className="text-content-muted text-[11px] tracking-wide uppercase">
            Invited, not yet accepted
          </span>
          <div className="border-line/10 divide-line/10 divide-y rounded-xl border">
            {invites.map((i) => (
              <div key={i.id} className="flex flex-wrap items-center gap-3 px-4 py-2.5">
                <div className="min-w-0 flex-1">
                  <p className="text-content truncate text-sm">{i.email}</p>
                  <p className="text-content-muted text-xs">
                    invited by {i.invitedBy} · expires{' '}
                    {new Date(i.expiresAt).toLocaleDateString('en-NG', {
                      day: 'numeric',
                      month: 'short',
                    })}
                  </p>
                </div>
                <Button
                  variant="outline"
                  disabled={busyInvite === i.id || inviting}
                  onClick={() => resend(i.id, i.email)}
                >
                  {busyInvite === i.id ? 'Sending…' : 'Resend'}
                </Button>
                <Button
                  variant="ghost"
                  disabled={busyInvite === i.id || inviting}
                  onClick={() => cancelInvite(i.id, i.email)}
                >
                  Cancel
                </Button>
              </div>
            ))}
          </div>
          {inviteNote && (
            <p className={cn('text-xs', inviteNote.ok ? 'text-lime-deep' : 'text-coral')}>
              {inviteNote.text}
            </p>
          )}
        </div>
      )}

      </TabsContent>

      {/* ── The roster ── */}
      <TabsContent value="agents" className="flex flex-col gap-2">
        {agents.length === 0 ? (
          <p className="text-content-muted border-line/10 rounded-xl border border-dashed p-6 text-center text-sm">
            Nobody has accepted an agent invite yet.
          </p>
        ) : (
          <div className="border-line/10 divide-line/10 divide-y rounded-xl border">
            {agents.map((a) => (
              // The whole row is the link. An oversight screen where the name is
              // not clickable makes you hunt for the way in.
              <Link
                key={a.id}
                href={`/admin/agents/${a.id}`}
                className="hover:bg-surface-deep flex flex-wrap items-center gap-3 px-4 py-3 transition-colors"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-content flex items-center gap-2 truncate text-sm">
                    {a.name}
                    {a.suspended && <Badge className="bg-coral/10 text-coral">suspended</Badge>}
                  </p>
                  {/* Only when it is not already the name   printing
                      taomina007@gmail.com twice tells nobody anything. */}
                  {a.hasName && a.email && (
                    <p className="text-content-muted truncate text-xs">{a.email}</p>
                  )}
                  {/* WHERE THEY WORK. Not a live position   see the note in
                      page.tsx   but the areas they have actually been to,
                      which is what an assignment decision needs. */}
                  {(a.areas.length > 0 || a.campus) && (
                    <p className="text-content-muted mt-0.5 flex items-center gap-1 truncate text-xs">
                      <MapPin className="size-3 shrink-0" />
                      {a.areas.length > 0 ? a.areas.slice(0, 3).join(", ") : a.campus}
                      {a.areas.length > 3 ? " +" + (a.areas.length - 3) : ""}
                    </p>
                  )}
                  <p className="text-content-muted mt-0.5 text-xs">
                    {a.lastSeenAt
                      ? `last seen ${new Date(a.lastSeenAt).toLocaleDateString('en-NG', {
                          day: 'numeric',
                          month: 'short',
                        })}`
                      : 'has never signed in'}
                  </p>
                </div>

                {/* The three numbers that say whether they are working: what is
                    on them, what they have sent back, what a reviewer closed. */}
                <div className="flex items-center gap-4 text-xs">
                  <Stat label="open" value={a.open} highlight={a.open > 0} />
                  <Stat label="submitted" value={a.submitted} />
                  <Stat label="decided" value={a.decided} />
                </div>

                <ChevronRight className="text-content-muted size-4 shrink-0" />
              </Link>
            ))}
          </div>
        )}
        <p className="text-content-muted text-xs">
          Open one to see everything that agent has done, in order.
        </p>
      </TabsContent>
    </Tabs>
  );
}

function Stat({
  label,
  value,
  highlight = false,
}: {
  label: string;
  value: number;
  highlight?: boolean;
}) {
  return (
    <span className="flex w-16 flex-col items-end">
      <span className={cn('font-mono text-sm', highlight ? 'text-lime-deep' : 'text-content')}>
        {value}
      </span>
      <span className="text-content-muted text-[10px] tracking-wide uppercase">{label}</span>
    </span>
  );
}
