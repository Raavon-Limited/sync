/**
 * ROUTE: /v/[slug]
 * ACCESS: everyone, signed in or not. This is what the QR on a vendor's ID
 *         card resolves to, and the person scanning it is usually a customer
 *         standing in front of the vendor with no Sync account.
 * PURPOSE: Say what Sync currently believes about a business.
 *
 * THE ANSWER IS FETCHED, NEVER CACHED.
 *   `force-dynamic` and `revalidate = 0` are load-bearing. The entire value of
 *   the card is that suspending an account at 11:00 makes the card scan as
 *   suspended at 11:00 — a cached page would keep vouching for somebody who
 *   has been removed, on a URL printed on cards already in circulation. That
 *   is worse than having no verification at all, because it looks like one.
 *
 * IT IS DELIBERATELY BORING TO READ. One state, one sentence, big enough to
 * take in at arm's length while somebody holds a phone up to a card.
 */
import type { Metadata } from 'next';
import Link from 'next/link';
import Image from 'next/image';
import { BadgeCheck, Clock, ShieldAlert, ShieldX, Store, Star } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import {
  fetchPublicVerification,
  VERIFICATION_PRESENTATION,
  type VerificationState,
} from '@/modules/verification/public-queries';
import { Rosette } from '@/components/brand/rosette';
import { SITE } from '@/config/site';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  return {
    title: `Verify · ${slug}`,
    description: `Check whether this business is verified on ${SITE.name}.`,
    // A verification result is a live answer about a named business. Letting
    // it be indexed would put a snapshot of somebody's status into search
    // results, outliving the status itself.
    robots: { index: false, follow: false },
  };
}

const TONE: Record<
  'good' | 'wait' | 'bad' | 'neutral',
  { ring: string; text: string; chip: string }
> = {
  good: {
    ring: 'ring-emerald-500/30',
    text: 'text-emerald-500',
    chip: 'bg-emerald-500/10 text-emerald-500',
  },
  wait: {
    ring: 'ring-amber-500/30',
    text: 'text-amber-500',
    chip: 'bg-amber-500/10 text-amber-500',
  },
  bad: { ring: 'ring-red-500/30', text: 'text-red-500', chip: 'bg-red-500/10 text-red-500' },
  neutral: {
    ring: 'ring-line/20',
    text: 'text-content-muted',
    chip: 'bg-ink/5 text-content-muted',
  },
};

function StateIcon({ state }: { state: VerificationState }) {
  const cls = 'size-10';
  if (state === 'verified') return <BadgeCheck className={cls} />;
  if (state === 'pending') return <Clock className={cls} />;
  if (state === 'suspended') return <ShieldAlert className={cls} />;
  if (state === 'unknown') return <ShieldX className={cls} />;
  return <ShieldAlert className={cls} />;
}

export default async function Page({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const supabase = await createClient();
  const result = await fetchPublicVerification(supabase, slug);
  const view = VERIFICATION_PRESENTATION[result.state];
  const tone = TONE[view.tone];

  return (
    <main className="bg-surface text-content relative isolate flex min-h-screen flex-col items-center justify-center overflow-hidden p-6">
      {/* The same rosette as the card, so the page a scan lands on is visibly
          the same object as the thing in the vendor's hand. */}
      <Rosette
        className="text-accent-fg/10 pointer-events-none absolute top-1/2 left-1/2 -z-10 w-[130vmin] -translate-x-1/2 -translate-y-1/2"
        size={512}
        strokeWidth={0.5}
      />

      <div className="border-line/10 bg-panel/80 w-full max-w-md rounded-3xl border p-8 backdrop-blur-sm">
        <p className="text-content-muted text-center font-mono text-xs tracking-widest uppercase">
          {SITE.name} verification
        </p>

        <div className={`mt-6 flex flex-col items-center gap-3 text-center`}>
          <span
            className={`flex size-20 items-center justify-center rounded-full ring-4 ${tone.ring} ${tone.text}`}
          >
            <StateIcon state={result.state} />
          </span>

          <h1 className="font-display text-content text-2xl">
            {result.businessName ?? result.slug}
          </h1>

          <span className={`rounded-full px-3 py-1 text-sm font-medium ${tone.chip}`}>
            {view.label}
          </span>

          <p className="text-content-muted max-w-xs text-sm">{view.blurb}</p>
        </div>

        {result.found && (
          <>
            {result.logoUrl && (
              <div className="mt-6 flex justify-center">
                <div className="border-line/10 relative size-16 overflow-hidden rounded-full border">
                  <Image src={result.logoUrl} alt="" fill sizes="64px" className="object-cover" />
                </div>
              </div>
            )}

            <dl className="border-line/10 divide-line/10 mt-6 divide-y rounded-xl border text-sm">
              {result.category && <Row label="Category">{result.category}</Row>}
              {result.area && <Row label="Area">{result.area}</Row>}
              <Row label="Stores">
                <span className="inline-flex items-center gap-1">
                  <Store className="size-3.5" /> {result.storeCount}
                </span>
              </Row>
              {result.ratingCount > 0 && (
                <Row label="Rating">
                  <span className="inline-flex items-center gap-1">
                    <Star className="size-3.5" /> {result.ratingAvg.toFixed(1)} ({result.ratingCount})
                  </span>
                </Row>
              )}
              {result.state === 'verified' && result.verifiedAt && (
                <Row label="Verified">{new Date(result.verifiedAt).toLocaleDateString()}</Row>
              )}
              {result.memberSince && (
                <Row label="On Sync since">
                  {new Date(result.memberSince).toLocaleDateString()}
                </Row>
              )}
            </dl>

            {result.state === 'verified' && (
              <Link
                href={`/food/${result.slug}`}
                className="text-lime-deep mt-5 block text-center text-sm underline underline-offset-2"
              >
                See this business on {SITE.name}
              </Link>
            )}
          </>
        )}

        {/* Dated on purpose: a screenshot of this page is a screenshot of a
            moment, and saying so is what stops one being passed around as a
            standing fact. */}
        <p className="text-content-muted mt-6 text-center text-xs">
          Checked {new Date(result.checkedAt).toLocaleString()}. This page is live — scan again at
          any time.
        </p>
      </div>

      <p className="text-content-muted mt-6 text-center text-xs">
        Powered by {SITE.legalName}
      </p>
    </main>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 px-4 py-2.5">
      <dt className="text-content-muted">{label}</dt>
      <dd className="text-content font-medium">{children}</dd>
    </div>
  );
}
