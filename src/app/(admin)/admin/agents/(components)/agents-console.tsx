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
import { Copy, Send, UserPlus } from 'lucide-react';
import { Badge, Button, Input } from '@/components/ui';
import { cn } from '@/lib/utils';
import { inviteAgent, revokeAgentInvite, assignVisit } from '@/modules/agents/actions';

export interface AgentRow {
  id: string;
  name: string;
  suspended: boolean;
  /** Visits assigned and not yet decided. */
  open: number;
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

  return (
    <div className="flex flex-col gap-6">
      {/* ── Send one somewhere ── */}
      <div className="border-line/10 bg-panel flex flex-col gap-3 rounded-xl border p-4">
        <p className="text-content flex items-center gap-2 text-sm font-medium">
          <Send className="size-4" /> Assign a visit
        </p>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <select value={agentId} onChange={(e) => setAgentId(e.target.value)} className={field}>
            <option value="">Choose an agent…</option>
            {agents
              .filter((a) => !a.suspended)
              .map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name} · {a.open} open
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
          <p className={cn('text-xs', assignNote.ok ? 'text-emerald-600' : 'text-coral')}>
            {assignNote.text}
          </p>
        )}
      </div>

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
          <p className={cn('text-xs', note.ok ? 'text-emerald-600' : 'text-coral')}>{note.text}</p>
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
      {invites.length > 0 && (
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
                <Button variant="ghost" onClick={() => revokeAgentInvite(i.id)}>
                  Cancel
                </Button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── The roster ── */}
      <div className="flex flex-col gap-2">
        <span className="text-content-muted text-[11px] tracking-wide uppercase">Agents</span>
        {agents.length === 0 ? (
          <p className="text-content-muted border-line/10 rounded-xl border border-dashed p-6 text-center text-sm">
            Nobody has accepted an agent invite yet.
          </p>
        ) : (
          <div className="border-line/10 divide-line/10 divide-y rounded-xl border">
            {agents.map((a) => (
              <div key={a.id} className="flex flex-wrap items-center gap-3 px-4 py-2.5">
                <p className="text-content min-w-0 flex-1 truncate text-sm">{a.name}</p>
                {a.suspended && <Badge className="bg-coral/10 text-coral">suspended</Badge>}
                <span className="text-content-muted text-xs">
                  {a.open} open visit{a.open === 1 ? '' : 's'}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
