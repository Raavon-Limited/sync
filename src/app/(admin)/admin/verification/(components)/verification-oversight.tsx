/**
 * The cross-account verification list: filter, find, click through to decide.
 *
 * ONE ROW SHAPE FOR EVERY KIND OF ACCOUNT
 *   A vendor, a landlord, a rider, a logistics company and a student are five
 *   tables with five different sets of columns, and none of that matters to the
 *   question this page answers. They are flattened to name / kind / state /
 *   where-to-go in the server component, so the filtering here is one predicate
 *   rather than five branches that would drift apart the first time a sixth
 *   kind appears.
 *
 *   Students were missing from this queue entirely until student_profiles gave
 *   them a status of their own   they had no row to read, because
 *   profiles.verification_status is the vendor mirror.
 *
 * BLOCKED AND SUSPENDED ARE CHIPS, NOT STATUSES
 *   Both are separate facts from `verification_status` in the database, and
 *   flattening them into the status column here would lose the distinction that
 *   20260901260000 and 20260901270000 both went out of their way to keep: a
 *   suspended vendor is still verified, and a fraud block is a rejection that
 *   cannot be re-applied against rather than a fifth state.
 */
'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { Building2, ChevronRight, GraduationCap, ShieldAlert, Store, Truck } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Badge, Input } from '@/components/ui';
import { VENDOR_BADGE } from '@/components/admin/verification-review';

export type OversightKind = 'vendor' | 'landlord' | 'rider' | 'company' | 'student';

export interface OversightRow {
  id: string;
  kind: OversightKind;
  name: string;
  detail: string;
  status: string;
  blocked: boolean;
  suspended: boolean;
  href: string;
  createdAt: string;
}

const KIND_ICON: Record<OversightKind, LucideIcon> = {
  vendor: Store,
  landlord: Building2,
  rider: Truck,
  company: Truck,
  student: GraduationCap,
};

const KIND_LABEL: Record<OversightKind, string> = {
  vendor: 'Vendor',
  landlord: 'Landlord',
  rider: 'Rider',
  company: 'Fleet',
  student: 'Student',
};

const STATUS_FILTERS = ['pending', 'unverified', 'verified', 'rejected'] as const;
const FLAG_FILTERS = ['blocked', 'suspended'] as const;
const KIND_FILTERS: OversightKind[] = ['vendor', 'landlord', 'rider', 'company'];

export function VerificationOversight({ rows }: { rows: OversightRow[] }) {
  const counts = useMemo(() => {
    const c: Record<string, number> = { all: rows.length };
    for (const r of rows) {
      c[r.status] = (c[r.status] ?? 0) + 1;
      if (r.blocked) c.blocked = (c.blocked ?? 0) + 1;
      if (r.suspended) c.suspended = (c.suspended ?? 0) + 1;
      c[r.kind] = (c[r.kind] ?? 0) + 1;
    }
    return c;
  }, [rows]);

  const [filter, setFilter] = useState<string>(() => (counts.pending ? 'pending' : 'all'));
  // Kind is a SECOND axis, not another chip in the same row: "pending riders"
  // is the question staff actually ask, and one combined filter list could
  // never express it.
  const [kind, setKind] = useState<OversightKind | 'all'>('all');
  const [search, setSearch] = useState('');

  const visible = rows.filter((r) => {
    if (kind !== 'all' && r.kind !== kind) return false;
    if (filter === 'blocked' && !r.blocked) return false;
    if (filter === 'suspended' && !r.suspended) return false;
    if (filter !== 'all' && filter !== 'blocked' && filter !== 'suspended' && r.status !== filter) {
      return false;
    }
    if (search && !r.name.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const chip = (active: boolean) =>
    `rounded-full border px-3 py-1 text-xs capitalize transition-colors ${
      active
        ? 'border-lime-deep/40 bg-lime/10 text-lime-deep'
        : 'border-line/10 text-content-muted hover:text-content'
    }`;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by name…"
          className="max-w-xs"
        />
        {[...STATUS_FILTERS, ...FLAG_FILTERS, 'all'].map((f) => (
          <button key={f} type="button" onClick={() => setFilter(f)} className={chip(filter === f)}>
            {f}
            {counts[f] ? <span className="ml-1.5 opacity-60">{counts[f]}</span> : null}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-content-muted text-[11px] tracking-wide uppercase">Type</span>
        <button type="button" onClick={() => setKind('all')} className={chip(kind === 'all')}>
          all
        </button>
        {KIND_FILTERS.map((k) => (
          <button key={k} type="button" onClick={() => setKind(k)} className={chip(kind === k)}>
            {KIND_LABEL[k]}
            {counts[k] ? <span className="ml-1.5 opacity-60">{counts[k]}</span> : null}
          </button>
        ))}
      </div>

      {visible.length === 0 ? (
        <p className="text-content-muted border-line/10 rounded-xl border border-dashed p-8 text-center text-sm">
          {rows.length === 0 ? 'Nobody has registered yet.' : 'Nothing matches those filters.'}
        </p>
      ) : (
        <div className="border-line/10 divide-line/10 divide-y rounded-xl border">
          {visible.map((r) => {
            const Icon = KIND_ICON[r.kind];
            return (
              <Link
                key={`${r.kind}-${r.id}`}
                href={r.href}
                className="hover:bg-ink/5 flex flex-wrap items-center gap-3 px-4 py-3 transition-colors"
              >
                <Icon className="text-content-muted size-4 shrink-0" aria-hidden="true" />
                <div className="min-w-0 flex-1">
                  <p className="text-content truncate text-sm font-medium">{r.name}</p>
                  <p className="text-content-muted text-xs">
                    {KIND_LABEL[r.kind]} · {r.detail} ·{' '}
                    {new Date(r.createdAt).toLocaleDateString('en-NG', {
                      month: 'short',
                      year: 'numeric',
                    })}
                  </p>
                </div>
                <Badge className={VENDOR_BADGE[r.status] ?? VENDOR_BADGE.unverified}>
                  {r.status}
                </Badge>
                {r.blocked && <Badge className="bg-rose-500/10 text-rose-600">fraud</Badge>}
                {r.suspended && (
                  <Badge className="bg-coral/10 text-coral flex items-center gap-1">
                    <ShieldAlert className="size-3" aria-hidden="true" />
                    suspended
                  </Badge>
                )}
                <ChevronRight className="text-content-muted size-4 shrink-0" aria-hidden="true" />
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
