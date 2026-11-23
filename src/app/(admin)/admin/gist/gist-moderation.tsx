/**
 * Client half of /admin/gist: hide / restore posts and polls, and the super
 * admin's reveal. The reveal asks for a written reason every time; the
 * database refuses without one and logs it (gist_identity_reveals).
 */
'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { formatDistanceToNowStrict } from 'date-fns';
import { Eye, EyeOff, ShieldAlert } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from '@/components/ui/toast';
import {
  revealGistAuthor,
  setGistHidden,
  setPollHidden,
  type RevealedAuthor,
} from '@/modules/gist/admin-actions';

export interface AdminGistRow {
  id: string;
  authorName: string;
  kind: string;
  body: string;
  createdAt: string;
  hidden: boolean;
  reports: number;
  campus: string;
}

export interface AdminPollRow {
  id: string;
  question: string;
  authorName: string;
  kind: string;
  scope: string;
  endsAt: string;
  hidden: boolean;
  reports: number;
}

export function GistModeration({
  posts,
  polls,
  show,
  isSuperAdmin,
}: {
  posts: AdminGistRow[];
  polls: AdminPollRow[];
  show: 'all' | 'hidden';
  isSuperAdmin: boolean;
}) {
  const [pending, start] = useTransition();
  const [revealed, setRevealed] = useState<Record<string, RevealedAuthor>>({});

  const toggle = (fn: () => Promise<{ ok: boolean; error?: string }>) =>
    start(async () => {
      const r = await fn();
      if (!r.ok) toast(r.error ?? 'Could not do that');
    });

  const reveal = (id: string) => {
    const reason = window.prompt(
      'Why are you revealing this account? Record the request (e.g. police reference). This is logged.',
    );
    if (!reason) return;
    start(async () => {
      const r = await revealGistAuthor(id, reason);
      if (!r.ok) {
        toast(r.error);
        return;
      }
      if (r.data) setRevealed((m) => ({ ...m, [id]: r.data! }));
    });
  };

  return (
    <>
      <section className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-display text-lg">Posts (last 72 days)</h2>
          <div className="flex gap-1.5 text-sm">
            <Link href="/admin/gist" className={cn('rounded-full border px-3 py-1', show === 'all' ? 'bg-ink text-cream' : 'border-line/20')}>
              All
            </Link>
            <Link href="/admin/gist?show=hidden" className={cn('rounded-full border px-3 py-1', show === 'hidden' ? 'bg-ink text-cream' : 'border-line/20')}>
              Hidden
            </Link>
          </div>
        </div>
        {posts.length === 0 ? (
          <p className="text-content-muted text-sm">Nothing here.</p>
        ) : (
          <ul className="divide-line/10 bg-panel border-line/10 flex flex-col divide-y rounded-2xl border">
            {posts.map((p) => (
              <li key={p.id} className={cn('flex flex-col gap-2 p-4 md:flex-row md:items-start', p.hidden && 'opacity-60')}>
                <div className="min-w-0 flex-1">
                  <p className="text-content-muted text-xs">
                    {p.campus} · {p.kind} · {p.authorName} · {formatDistanceToNowStrict(new Date(p.createdAt), { addSuffix: true })}
                    {p.reports > 0 && <span className="text-coral-deep"> · {p.reports} report{p.reports === 1 ? '' : 's'}</span>}
                    {p.hidden && ' · hidden'}
                  </p>
                  <p className="mt-1 text-sm break-words">{p.body}</p>
                  {revealed[p.id] && (
                    <p className="bg-surface-deep mt-2 rounded-lg p-2 text-xs">
                      <strong>Account:</strong> {revealed[p.id].full_name ?? 'No name'} · {revealed[p.id].email ?? 'no email'} ·{' '}
                      <span className="font-mono">{revealed[p.id].author_id}</span>
                    </p>
                  )}
                </div>
                <div className="flex shrink-0 gap-2">
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => toggle(() => setGistHidden(p.id, !p.hidden))}
                    className="border-line/20 flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold"
                  >
                    {p.hidden ? <Eye className="size-3.5" /> : <EyeOff className="size-3.5" />}
                    {p.hidden ? 'Restore' : 'Hide'}
                  </button>
                  {isSuperAdmin && !revealed[p.id] && (
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() => reveal(p.id)}
                      className="text-coral-deep border-coral-deep/30 flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold"
                    >
                      <ShieldAlert className="size-3.5" /> Reveal account
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="font-display text-lg">Polls</h2>
        {polls.length === 0 ? (
          <p className="text-content-muted text-sm">No polls yet.</p>
        ) : (
          <ul className="divide-line/10 bg-panel border-line/10 flex flex-col divide-y rounded-2xl border">
            {polls.map((p) => (
              <li key={p.id} className={cn('flex items-start justify-between gap-3 p-4', p.hidden && 'opacity-60')}>
                <div className="min-w-0">
                  <p className="text-sm font-semibold">{p.question}</p>
                  <p className="text-content-muted text-xs">
                    {p.kind} · {p.scope} · by {p.authorName} · ends {formatDistanceToNowStrict(new Date(p.endsAt), { addSuffix: true })}
                    {p.reports > 0 && <span className="text-coral-deep"> · {p.reports} report{p.reports === 1 ? '' : 's'}</span>}
                  </p>
                </div>
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => toggle(() => setPollHidden(p.id, !p.hidden))}
                  className="border-line/20 flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold"
                >
                  {p.hidden ? <Eye className="size-3.5" /> : <EyeOff className="size-3.5" />}
                  {p.hidden ? 'Restore' : 'Hide'}
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
