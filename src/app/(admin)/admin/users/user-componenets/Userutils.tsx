import type { EnrichedUser } from './UsersClient';
import { hasVerification } from '@/modules/admin/account-types';

const BG = ['#dbeafe','#dcfce7','#ede9fe','#fef9c3','#fee2e2','#ffedd5'];
const FG = ['#1e40af','#166534','#5b21b6','#854d0e','#991b1b','#9a3412'];

export function avatarColors(name: string): [string, string] {
  const idx = (name.charCodeAt(0) || 0) % BG.length;
  return [BG[idx], FG[idx]];
}

export function initials(name: string | null): string {
  if (!name) return '?';
  return name.split(' ').filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase();
}

/**
 * WHAT THIS BADGE IS ALLOWED TO SAY.
 *
 * It tested for 'active', which `verification_status` cannot hold   the check
 * constraint in 0001 permits unverified/pending/verified/rejected and nothing
 * else. So the green badge was unreachable and a genuinely verified vendor fell
 * through to the grey fallback reading "VERIFIED" in the same style as
 * "UNVERIFIED".
 *
 * And staff and agents were labelled "Unverified" for ever: they hold the
 * column's default and will never apply for anything. That is a task-shaped
 * word for a task nobody can do   see `hasVerification`.
 */
export function statusBadge(u: EnrichedUser) {
  if (u.archived_at) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-red-100 px-2.5 py-0.5 text-[0.68rem] font-semibold uppercase tracking-wide text-red-700">
        Archived
      </span>
    );
  }
  if (!hasVerification(u.role)) {
    return (
      <span className="bg-ink/5 text-content-muted inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[0.68rem] font-semibold uppercase tracking-wide">
        No review needed
      </span>
    );
  }
  if (u.verification_status === 'verified') {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-green-100 px-2.5 py-0.5 text-[0.68rem] font-semibold uppercase tracking-wide text-green-700">
        Verified
      </span>
    );
  }
  if (u.verification_status === 'rejected') {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-red-100 px-2.5 py-0.5 text-[0.68rem] font-semibold uppercase tracking-wide text-red-700">
        Rejected
      </span>
    );
  }
  if (u.verification_status === 'pending') {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-yellow-100 px-2.5 py-0.5 text-[0.68rem] font-semibold uppercase tracking-wide text-yellow-700">
        Pending
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-gray-100 px-2.5 py-0.5 text-[0.68rem] font-semibold uppercase tracking-wide text-gray-600 capitalize">
      {u.verification_status}
    </span>
  );
}

export function formatRole(role: string): string {
  return role.replace('_', ' ');
}

export function formatCurrency(n: number | undefined | null): string {
  if (!n) return '₦0';
  return '₦' + n.toLocaleString('en-NG');
}

export function formatDate(d: string): string {
  return new Date(d).toLocaleDateString('en-NG', { day: 'numeric', month: 'short', year: 'numeric' });
}