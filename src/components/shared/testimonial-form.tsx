/**
 * TestimonialForm - "leave a review" for the marketing pages.
 *
 * Says up front that a review is checked before it appears. Hiding that would
 * mean someone submits, sees nothing on the page, and assumes it broke.
 *
 * Three states, driven by whether the author already has a submission:
 *   pending  - waiting on a superadmin, form replaced by a note
 *   rejected - shows the moderator's reason so it can be fixed and resubmitted
 *   none/approved - the form
 */
'use client';

import { useState, useTransition } from 'react';
import { Check, Loader2, Star } from 'lucide-react';

import { submitTestimonial } from '@/modules/testimonials/actions';
import type { PendingTestimonial } from '@/modules/testimonials/queries';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

const MAX_BODY = 600;

export function TestimonialForm({
  signedIn,
  existing,
}: {
  signedIn: boolean;
  /** The author's most recent submission, if any. */
  existing: PendingTestimonial | null;
}) {
  const [rating, setRating] = useState(5);
  const [body, setBody] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [pending, startTransition] = useTransition();

  if (!signedIn) {
    return (
      <p className="text-content-muted text-sm">
        <a href="/login" className="text-accent-fg underline underline-offset-4">
          Sign in
        </a>{' '}
        to leave a review.
      </p>
    );
  }

  if (done || existing?.status === 'pending') {
    return (
      <p className="border-line/10 bg-panel text-content flex items-start gap-2.5 rounded-xl border p-4 text-sm">
        <Check className="text-accent-fg mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
        <span>
          Thanks — your review is with our team. It appears here once it&rsquo;s been checked.
        </span>
      </p>
    );
  }

  const submit = (formData: FormData) => {
    setError(null);
    startTransition(async () => {
      const res = await submitTestimonial(formData);
      if (res.ok) setDone(true);
      else setError(res.error);
    });
  };

  return (
    <form action={submit} className="flex flex-col gap-4">
      {existing?.status === 'rejected' && existing.reviewNote && (
        <p className="border-line/10 bg-surface-deep text-content-muted rounded-xl border p-3 text-xs">
          Your last review wasn&rsquo;t published: {existing.reviewNote}
        </p>
      )}

      <fieldset className="flex items-center gap-2">
        <legend className="sr-only">Rating</legend>
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => setRating(n)}
            aria-label={`${n} star${n > 1 ? 's' : ''}`}
            aria-pressed={rating === n}
            className="transition-transform active:scale-90"
          >
            <Star
              className={cn(
                'h-6 w-6',
                n <= rating ? 'fill-lime text-lime' : 'text-content-muted/40',
              )}
            />
          </button>
        ))}
        <input type="hidden" name="rating" value={rating} />
      </fieldset>

      <label className="flex flex-col gap-1.5">
        <span className="sr-only">Your review</span>
        <textarea
          name="body"
          rows={4}
          required
          minLength={20}
          maxLength={MAX_BODY}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="What did Sync actually change for you?"
          className="border-line/10 bg-panel text-content placeholder:text-content-muted focus:border-line w-full resize-y rounded-xl border p-3 text-sm outline-none"
        />
        <span className="text-content-muted self-end text-[11px]">
          {body.length}/{MAX_BODY}
        </span>
      </label>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1">
          <span className="text-content-muted font-mono text-[10px] tracking-wider uppercase">
            Display name (optional)
          </span>
          <input
            name="display_name"
            maxLength={60}
            placeholder="Aisha O."
            className="border-line/10 bg-panel text-content placeholder:text-content-muted focus:border-line rounded-xl border px-3 py-2 text-sm outline-none"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-content-muted font-mono text-[10px] tracking-wider uppercase">
            Detail (optional)
          </span>
          <input
            name="detail"
            maxLength={60}
            placeholder="300L · KWASU"
            className="border-line/10 bg-panel text-content placeholder:text-content-muted focus:border-line rounded-xl border px-3 py-2 text-sm outline-none"
          />
        </label>
      </div>

      {error && <p className="text-warning text-sm">{error}</p>}

      <div className="flex items-center gap-3">
        <Button type="submit" size="md" disabled={pending}>
          {pending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
          {pending ? 'Sending…' : 'Submit review'}
        </Button>
        {/* Set expectations before they submit, not after. */}
        <span className="text-content-muted text-xs">Checked by our team before it appears.</span>
      </div>
    </form>
  );
}
