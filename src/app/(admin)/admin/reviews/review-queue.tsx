/**
 * ReviewQueue - the moderation UI for testimonials.
 *
 * Staff can read every tab. Only a super_admin sees the approve/reject
 * controls, and the server action re-checks that role before writing - this
 * component hiding a button is a courtesy, not the boundary.
 *
 * Rejection requires a reason. It is shown back to the author on the landing
 * page so they can fix and resubmit, which is the difference between
 * moderation and a black hole.
 */
'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Check, Loader2, Star, X } from 'lucide-react';

import { approveTestimonial, rejectTestimonial } from '@/modules/testimonials/actions';
import type { PendingTestimonial, TestimonialStatus } from '@/modules/testimonials/queries';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

const TABS: { key: TestimonialStatus; label: string }[] = [
  { key: 'pending', label: 'Pending' },
  { key: 'approved', label: 'Published' },
  { key: 'rejected', label: 'Rejected' },
];

export function ReviewQueue({
  items,
  counts,
  status,
  canModerate,
}: {
  items: PendingTestimonial[];
  counts: Record<TestimonialStatus, number>;
  status: TestimonialStatus;
  canModerate: boolean;
}) {
  return (
    <section className="flex flex-col gap-6">
      <header>
        <p className="eyebrow text-accent-fg">Moderation</p>
        <h1 className="font-display text-section text-content mt-1">Reviews</h1>
        <p className="text-content-muted mt-2 max-w-xl text-sm">
          Student reviews stay invisible on the marketing pages until they are published here.
          {!canModerate && ' You can read the queue; publishing needs a super admin.'}
        </p>
      </header>

      <nav aria-label="Review status" className="flex flex-wrap gap-2">
        {TABS.map((t) => (
          <Link
            key={t.key}
            href={`/admin/reviews?status=${t.key}`}
            aria-current={status === t.key ? 'page' : undefined}
            className={cn(
              'inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm transition-colors',
              status === t.key
                ? 'bg-lime text-ink border-transparent font-medium'
                : 'border-line/15 text-content hover:bg-ink/5',
            )}
          >
            {t.label}
            <span
              className={cn(
                'rounded-full px-1.5 text-[11px]',
                status === t.key ? 'bg-ink/10' : 'bg-ink/5 text-content-muted',
              )}
            >
              {counts[t.key]}
            </span>
          </Link>
        ))}
      </nav>

      {items.length === 0 ? (
        <p className="border-line/10 text-content-muted rounded-2xl border border-dashed p-8 text-center text-sm">
          {status === 'pending' ? 'Nothing waiting. All caught up.' : `No ${status} reviews.`}
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {items.map((t) => (
            <ReviewRow key={t.id} item={t} canModerate={canModerate} />
          ))}
        </ul>
      )}
    </section>
  );
}

function ReviewRow({ item, canModerate }: { item: PendingTestimonial; canModerate: boolean }) {
  const router = useRouter();
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const run = (fn: () => Promise<{ ok: true } | { ok: false; error: string }>) => {
    setError(null);
    startTransition(async () => {
      const res = await fn();
      if (res.ok) {
        setRejecting(false);
        setReason('');
        // The row moves to another tab, so re-fetch rather than mutate locally.
        router.refresh();
      } else {
        setError(res.error);
      }
    });
  };

  return (
    <li className="border-line/10 bg-panel flex flex-col gap-3 rounded-2xl border p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-content text-sm font-medium">{item.name}</p>
          <p className="text-content-muted text-xs">
            {item.detail ? `${item.detail} · ` : ''}
            {item.authorEmail ?? 'no email'} ·{' '}
            {new Date(item.createdAt).toLocaleDateString('en-NG', {
              day: 'numeric',
              month: 'short',
              year: 'numeric',
            })}
          </p>
        </div>
        <div aria-label={`${item.rating} out of 5`} className="flex shrink-0 gap-0.5">
          {Array.from({ length: item.rating }).map((_, i) => (
            <Star key={i} className="fill-lime text-lime h-4 w-4" strokeWidth={1.5} />
          ))}
        </div>
      </div>

      <blockquote className="text-content text-[15px] leading-relaxed">
        &ldquo;{item.body}&rdquo;
      </blockquote>

      {item.status === 'rejected' && item.reviewNote && (
        <p className="text-content-muted border-line/10 border-t pt-3 text-xs">
          Rejected: {item.reviewNote}
        </p>
      )}

      {error && <p className="text-warning text-sm">{error}</p>}

      {canModerate && item.status !== 'approved' && !rejecting && (
        <div className="flex flex-wrap gap-2">
          <Button size="sm" disabled={pending} onClick={() => run(() => approveTestimonial(item.id))}>
            {pending ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <Check className="h-4 w-4" aria-hidden="true" />
            )}
            Publish
          </Button>
          {item.status === 'pending' && (
            <Button size="sm" variant="outline" disabled={pending} onClick={() => setRejecting(true)}>
              <X className="h-4 w-4" aria-hidden="true" />
              Reject
            </Button>
          )}
        </div>
      )}

      {canModerate && rejecting && (
        <div className="flex flex-col gap-2">
          <label className="flex flex-col gap-1">
            <span className="text-content-muted font-mono text-[10px] tracking-wider uppercase">
              Reason (shown to the author)
            </span>
            <input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Mentions a competitor by name"
              className="border-line/10 bg-surface-deep text-content focus:border-line rounded-xl border px-3 py-2 text-sm outline-none"
            />
          </label>
          <div className="flex gap-2">
            <Button
              size="sm"
              disabled={pending || !reason.trim()}
              onClick={() => run(() => rejectTestimonial(item.id, reason))}
            >
              {pending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
              Confirm reject
            </Button>
            <Button size="sm" variant="ghost" disabled={pending} onClick={() => setRejecting(false)}>
              Cancel
            </Button>
          </div>
        </div>
      )}
    </li>
  );
}
