/**
 * ROUTE: /me/reviews
 * ACCESS: authenticated student
 * PURPOSE: Reviews the student has left, and prompts to leave reviews on completed bookings.
 * BUILT HERE: Tabs: 'To review' / 'Posted'. <ReviewCard> list, inline rating form.
 * TODO: implement the full screen once dependent modules + data are wired.
 */
"use client";

import { useMemo, useState } from 'react';
import { useMyReviews, usePendingReviews, useSubmitReview } from '@/modules/reviews/hooks';
import type { PendingReview as DomainPending } from '@/modules/reviews/types';
import { EmptyState, ReviewCard } from '@/components/shared'; // Added the official ReviewCard import
import { Star, MessageSquare, Calendar, Send } from 'lucide-react';

interface PendingReview {
  id: string;
  type: string;
  title: string;
  provider: string;
  date: string;
  /** Carried through so the submit RPC knows what is being reviewed. */
  source: DomainPending;
}

// Updated data properties to align nicely with global shared ReviewCard structures
interface MockPostedReview {
  id: string;
  title: string;
  subtitle?: string;
  rating: number;
  content: string;
  date: string;
}

export default function MyReviewsPage() {
  const [activeTab, setActiveTab] = useState<'pending' | 'posted'>('pending');
  const [selectedPendingId, setSelectedPendingId] = useState<string | null>(null);
  
  const [rating, setRating] = useState<number>(0);
  const [hoverRating, setHoverRating] = useState<number>(0);
  const [comment, setComment] = useState<string>('');

  const { data: pending = [], isLoading: lp } = usePendingReviews();
  const { data: posted = [], isLoading: lr } = useMyReviews();
  const submit = useSubmitReview();
  const [error, setError] = useState<string | null>(null);
  const isLoading = lp || lr;

  const day = (iso: string) =>
    new Date(iso).toLocaleDateString('en-NG', { day: 'numeric', month: 'long', year: 'numeric' });

  const pendingReviews = useMemo<PendingReview[]>(
    () =>
      pending.map((p) => ({
        id: `${p.sourceType}:${p.sourceId}`,
        // The source is what the student recognises: an order, a stay, a job.
        type: p.sourceType === 'service_request' ? 'Service' : p.sourceType === 'booking' ? 'Hostel' : 'Order',
        title: p.label,
        // The counterparty's name needs a disclosure RPC (profiles is
        // own-row-only), so the subject kind is shown instead of a fake name.
        provider: p.subjectType === 'hostel' ? 'Hostel' : p.subjectType === 'rider' ? 'Rider' : 'Vendor',
        date: `Completed ${day(p.occurredAt)}`,
        source: p,
      })),
    [pending],
  );

  const postedReviews = useMemo<MockPostedReview[]>(
    () =>
      posted.map((r) => ({
        id: r.id,
        title: r.title ?? 'Review',
        subtitle: `Verified Review · ${r.subjectType}`,
        rating: r.rating,
        content: r.body ?? '',
        date: day(r.createdAt),
      })),
    [posted],
  );

  const handleSubmitReview = (item: PendingReview) => {
    if (rating === 0) return;
    setError(null);

    submit.mutate(
      {
        subjectType: item.source.subjectType,
        subjectId: item.source.subjectId,
        sourceType: item.source.sourceType,
        sourceId: item.source.sourceId,
        rating,
        title: item.title,
        // Empty rather than a placeholder sentence the student never wrote.
        body: comment.trim() || undefined,
      },
      {
        onSuccess() {
          // Both lists are invalidated by the hook; the item moves itself.
          setSelectedPendingId(null);
          setRating(0);
          setComment('');
          setActiveTab('posted');
        },
        // submit_review refuses anything the caller was not party to, or that
        // is not complete. Show its reason rather than failing silently.
        onError: (e) => setError(e instanceof Error ? e.message : 'Could not post the review'),
      },
    );
  };

  return (
    <section className="flex flex-col gap-3">
      <h1 className="font-mono text-sm tracking-wide text-content-muted">
        /ME/REVIEWS
      </h1>

      <div className="flex w-full flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="font-display mt-2 text-3xl font-medium text-content">
          My <span className="text-lime">Reviews</span>
        </h2>
      </div>

      {/* View Selector Tabs */}
      <div className="border-line/10 mt-4 flex gap-2 border-b pb-px">
        <button
          onClick={() => setActiveTab('pending')}
          className={`font-body relative pb-3 text-sm font-medium transition-colors flex items-center gap-2 ${
            activeTab === 'pending' ? 'text-content' : 'text-content-muted hover:text-content'
          }`}
        >
          To Review
          {pendingReviews.length > 0 && (
            <span className="bg-lime text-ink flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-bold">
              {pendingReviews.length}
            </span>
          )}
          {activeTab === 'pending' && <div className="bg-lime absolute bottom-0 left-0 h-0.5 w-full" />}
        </button>

        <button
          onClick={() => setActiveTab('posted')}
          className={`font-body relative pb-3 text-sm font-medium transition-colors flex items-center gap-2 ${
            activeTab === 'posted' ? 'text-content' : 'text-content-muted hover:text-content'
          }`}
        >
          Posted History
          <span className="text-content-muted text-xs">({postedReviews.length})</span>
          {activeTab === 'posted' && <div className="bg-lime absolute bottom-0 left-0 h-0.5 w-full" />}
        </button>
      </div>

      {/* submit_review refuses anything not yours or not yet complete. Its
          reason is worth showing   "nothing happened" is the worst outcome. */}
      {error && (
        <p className="text-coral border-coral/30 bg-coral/5 mt-3 rounded-lg border px-3 py-2 text-sm">
          {error}
        </p>
      )}

      {/* Main Content Render Block */}
      <section className="mt-6">
        {activeTab === 'pending' ? (
          isLoading ? (
            <div className="flex flex-col gap-3">
              {Array.from({ length: 2 }).map((_, i) => (
                <div key={i} className="bg-ink/5 h-24 animate-pulse rounded-xl" />
              ))}
            </div>
          ) : pendingReviews.length === 0 ? (
            <EmptyState
              title="All caught up!"
              description="You don't have any pending orders or completed campus services waiting for a review right now."
            />
          ) : (
            <div className="flex flex-col gap-4">
              {pendingReviews.map((item) => {
                const isFormOpen = selectedPendingId === item.id;
                return (
                  <div 
                    key={item.id}
                    className="border-line/10 bg-panel/40 flex flex-col rounded-xl border p-5 backdrop-blur-sm transition-all"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-4">
                      <div>
                        <span className="font-mono text-[10px] uppercase tracking-wider text-lime bg-lime/10 px-2 py-0.5 rounded">
                          {item.type}
                        </span>
                        <h3 className="font-display text-lg font-medium text-content mt-2">
                          {item.title}
                        </h3>
                        <p className="font-body text-xs text-content-muted mt-0.5">
                          Provided by {item.provider}
                        </p>
                      </div>

                      <button
                        onClick={() => setSelectedPendingId(isFormOpen ? null : item.id)}
                        className="bg-lime text-ink hover:bg-lime/90 flex items-center gap-2 rounded-lg px-4 py-2 font-body text-xs font-semibold transition-colors shadow-sm"
                      >
                        <MessageSquare className="h-3.5 w-3.5" />
                        {isFormOpen ? "Close Form" : "Write Review"}
                      </button>
                    </div>

                    {/* Expanding Dynamic Rating Form */}
                    {isFormOpen && (
                      <div className="bg-panel/60 border border-line/5 mt-5 rounded-lg p-4 flex flex-col gap-4 animate-in fade-in slide-in-from-top-2 duration-200">
                        <div className="flex items-center gap-2">
                          <span className="font-body text-xs text-content-muted mr-2">Your Rating:</span>
                          {[1, 2, 3, 4, 5].map((star) => (
                            <button
                              key={star}
                              type="button"
                              onClick={() => setRating(star)}
                              onMouseEnter={() => setHoverRating(star)}
                              onMouseLeave={() => setHoverRating(0)}
                              className="transition-transform active:scale-95"
                            >
                              <Star 
                                className={`h-5 w-5 ${
                                  star <= (hoverRating || rating) 
                                    ? 'text-lime fill-lime' 
                                    : 'text-content-muted/30'
                                }`} 
                              />
                            </button>
                          ))}
                        </div>

                        <div className="flex flex-col gap-1.5">
                          <label className="font-body text-xs text-content-muted">Share your detailed experience:</label>
                          <textarea
                            value={comment}
                            onChange={(e) => setComment(e.target.value)}
                            placeholder="How was the service? Mention responsiveness, value, or location details..."
                            className="bg-panel/40 border border-line/10 focus:border-lime/30 rounded-lg p-3 font-body text-sm text-content placeholder-content-muted/50 focus:outline-none resize-none h-24 transition-colors"
                          />
                        </div>

                        <div className="flex justify-end">
                          <button
                            onClick={() => handleSubmitReview(item)}
                            disabled={rating === 0}
                            className="bg-ink text-cream hover:bg-ink/90 disabled:opacity-30 disabled:hover:bg-ink flex items-center gap-2 rounded-lg px-4 py-2 font-body text-xs font-medium transition-all"
                          >
                            <Send className="h-3.5 w-3.5" />
                            Submit Feedback
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )
        ) : (
          isLoading ? (
            <div className="flex flex-col gap-3">
              {Array.from({ length: 2 }).map((_, i) => (
                <div key={i} className="bg-ink/5 h-24 animate-pulse rounded-xl" />
              ))}
            </div>
          ) : postedReviews.length === 0 ? (
            <EmptyState
              title="No posted feedback"
              description="Reviews or ratings you publish across campus spaces will show up directly in this history log."
            />
          ) : (
            <div className="grid grid-cols-1 gap-4">
              {/* Refactored loop cleanly applying the system's official <ReviewCard /> composite component */}
              {postedReviews.map((review) => (
                <ReviewCard
                  key={review.id}
                  author={{ name: review.title }}
                  rating={review.rating}
                  body={review.content}
                  createdAt={review.date}
                />
              ))}
            </div>
          )
        )}
      </section>
    </section>
  );
}