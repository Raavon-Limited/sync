/**
 * ROUTE: /v/[code]
 * ACCESS: everyone, signed in or not   and in practice only whoever is holding
 *         the card, because the code is 128 unguessable bits that appear
 *         nowhere else. See 20260901190000 for why that, rather than trying to
 *         detect a camera, is what "only reachable by scanning" means.
 * PURPOSE: Let somebody standing at their own front door decide whether the
 *          stranger asking to come in is who the platform says they are.
 *
 * WHO THIS IS ACTUALLY FOR
 *   A shop's card answers "is this business real", and the business is already
 *   public. An agent's card answers "should I open this door", it is checked
 *   by one person alone with another, and the PHOTOGRAPH is the part doing the
 *   work   a name and a tick could belong to anybody holding the card. So the
 *   photo is the largest thing on the page and everything else supports it.
 *
 * THE ANSWER IS FETCHED, NEVER CACHED.
 *   `force-dynamic` and `revalidate = 0` are load-bearing. Suspending an
 *   account at 11:00 has to make the card read "suspended" at 11:00, on a URL
 *   printed on cards already in circulation. A cached page would keep vouching
 *   for somebody who has been removed   worse than no verification, because it
 *   looks like one.
 *
 * `noindex` for the same reason plus one more: this page has a person's face
 * on it and must never end up in a search result.
 */
import type { Metadata } from 'next';
import Image from 'next/image';
import { BadgeCheck, Clock, ShieldAlert, ShieldX, Check, X, Store, Star, User } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import {
  fetchCardVerification,
  VERIFICATION_PRESENTATION,
  type VerificationState,
} from '@/modules/verification/public-queries';
import { requirementSpec } from '@/modules/verification/requirements';
import { Rosette } from '@/components/brand/rosette';
import { SITE } from '@/config/site';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export const metadata: Metadata = {
  title: `Verify · ${SITE.name}`,
  description: `Check a ${SITE.name} ID card.`,
  robots: { index: false, follow: false, nocache: true },
};

const TONE: Record<
  'good' | 'wait' | 'bad' | 'neutral',
  { ring: string; text: string; chip: string; bar: string }
> = {
  good: {
    ring: 'ring-emerald-500/40',
    text: 'text-emerald-500',
    chip: 'bg-emerald-500/10 text-emerald-500',
    bar: 'bg-emerald-500',
  },
  wait: {
    ring: 'ring-amber-500/40',
    text: 'text-amber-500',
    chip: 'bg-amber-500/10 text-amber-500',
    bar: 'bg-amber-500',
  },
  bad: {
    ring: 'ring-red-500/40',
    text: 'text-red-500',
    chip: 'bg-red-500/10 text-red-500',
    bar: 'bg-red-500',
  },
  neutral: {
    ring: 'ring-line/20',
    text: 'text-content-muted',
    chip: 'bg-ink/5 text-content-muted',
    bar: 'bg-content-muted',
  },
};

function StateIcon({ state }: { state: VerificationState }) {
  const cls = 'size-9';
  if (state === 'verified') return <BadgeCheck className={cls} />;
  if (state === 'pending') return <Clock className={cls} />;
  if (state === 'unknown') return <ShieldX className={cls} />;
  return <ShieldAlert className={cls} />;
}

export default async function Page({ params }: { params: Promise<{ slug: string }> }) {
  // The dynamic segment is named `slug` for the folder; what it carries is the
  // card CODE. Renaming the directory would change nothing else and churn the
  // route, so the meaning is documented rather than encoded in the path.
  const { slug: code } = await params;
  const supabase = await createClient();
  const result = await fetchCardVerification(supabase, code);
  const view = VERIFICATION_PRESENTATION[result.state];
  const tone = TONE[view.tone];

  return (
    <main className="bg-surface text-content relative isolate flex min-h-screen flex-col items-center justify-center overflow-hidden p-5">
      <Rosette
        className="text-accent-fg/10 pointer-events-none absolute top-1/2 left-1/2 -z-10 w-[130vmin] -translate-x-1/2 -translate-y-1/2"
        size={512}
        strokeWidth={0.5}
      />

      <div className="border-line/10 bg-panel/85 w-full max-w-sm overflow-hidden rounded-3xl border backdrop-blur-sm">
        {/* A colour bar at the very top, readable before anything is parsed.
            Somebody holding a phone up at a door reads this first. */}
        <div className={`h-1.5 w-full ${tone.bar}`} />

        <div className="flex flex-col items-center gap-4 p-7 text-center">
          <p className="text-content-muted font-mono text-[10px] tracking-widest uppercase">
            {SITE.name} ID check
          </p>

          {/* THE FACE, FIRST AND LARGEST. Everything else on this page is
              supporting evidence for the one comparison that matters: is this
              the person in front of me? */}
          {result.found && result.photoUrl ? (
            <div
              className={`border-line/10 relative size-32 overflow-hidden rounded-full border ring-4 ${tone.ring}`}
            >
              <Image
                src={result.photoUrl}
                alt=""
                fill
                sizes="128px"
                className="object-cover"
                unoptimized
              />
            </div>
          ) : (
            <span
              className={`bg-ink/5 text-content-muted flex size-32 items-center justify-center rounded-full ring-4 ${tone.ring}`}
            >
              <User className="size-12" strokeWidth={1.25} />
            </span>
          )}

          <div className="flex flex-col gap-1">
            {result.holderName && (
              <h1 className="font-display text-content text-2xl leading-tight">
                {result.holderName}
              </h1>
            )}
            {result.businessName && (
              <p
                className={
                  result.holderName
                    ? 'text-content-muted text-sm'
                    : 'font-display text-content text-2xl'
                }
              >
                {result.businessName}
              </p>
            )}
            {!result.found && <h1 className="font-display text-content text-2xl">Unknown card</h1>}
          </div>

          <span
            className={`inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-sm font-semibold ${tone.chip}`}
          >
            <span className={tone.text}>
              <StateIcon state={result.state} />
            </span>
            {view.label}
          </span>

          <p className="text-content-muted text-sm">{view.blurb}</p>

          {result.found && (
            <>
              {/* EVERY HAT THIS PERSON WEARS, each with its own answer.
                  A landlord who is also a student is one human being and two
                  independent decisions; reporting only the first would hide
                  the second from whoever is standing there. Staff appear here
                  too   "this person works for Sync" is the claim most worth
                  being able to test at a door. */}
              {result.credentials.length > 0 && (
                <div className="border-line/10 mt-1 w-full rounded-xl border p-3 text-left">
                  <p className="text-content-muted mb-2 font-mono text-[10px] tracking-widest uppercase">
                    On {SITE.name} as
                  </p>
                  <ul className="flex flex-col gap-2">
                    {result.credentials.map((c) => (
                      <li key={c.kind} className="flex items-center justify-between gap-3 text-sm">
                        <span className="text-content">{c.label}</span>
                        <span
                          className={
                            c.state === 'verified'
                              ? 'text-xs font-semibold text-emerald-500'
                              : c.state === 'pending'
                                ? 'text-xs font-semibold text-amber-500'
                                : 'text-content-muted text-xs font-semibold'
                          }
                        >
                          {c.state === 'verified'
                            ? 'Verified'
                            : c.state === 'pending'
                              ? 'In review'
                              : c.state === 'rejected'
                                ? 'Not verified'
                                : 'Not verified'}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* What the platform actually checked. Named, so "verified" is a
                  claim with contents rather than a badge. Never the documents
                  themselves   the answer is "we checked", not "here it is". */}
              {result.requirements.length > 0 && (
                <div className="border-line/10 mt-1 w-full rounded-xl border p-3 text-left">
                  <p className="text-content-muted mb-2 font-mono text-[10px] tracking-widest uppercase">
                    Documents {SITE.name} has checked
                  </p>
                  <ul className="flex flex-col gap-2.5">
                    {result.requirements.map((r) => {
                      // Wording comes from the shared spec, so this page and
                      // the vendor's own upload screen cannot drift into
                      // describing the same check differently.
                      const spec = requirementSpec(r.key);
                      return (
                        <li key={r.key} className="flex items-start gap-2 text-sm">
                          {r.met ? (
                            <Check className="mt-0.5 size-4 shrink-0 text-emerald-500" />
                          ) : (
                            <X className="text-content-muted mt-0.5 size-4 shrink-0" />
                          )}
                          <span className="flex min-w-0 flex-col">
                            <span className={r.met ? 'text-content' : 'text-content-muted'}>
                              {spec?.label ?? r.label}
                              {!r.met && <span className="text-content-muted"> not provided</span>}
                            </span>
                            {/* The documents by the names people use   NIN,
                                CAC. It lists what SATISFIES the check rather
                                than naming one, because a government ID can be
                                a NIN slip, a licence or a passport and the
                                record does not say which. Printing "NIN
                                verified" over a passport would be a false
                                statement on the one page whose job is being
                                true. */}
                            {spec?.accepts && (
                              <span className="text-content-muted text-xs">{spec.accepts}</span>
                            )}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )}

              <dl className="border-line/10 divide-line/10 w-full divide-y rounded-xl border text-sm">
                {result.category && <Row label="Type">{result.category}</Row>}
                {result.area && <Row label="Area">{result.area}</Row>}
                {result.storeCount > 0 && (
                  <Row label="Stores">
                    <span className="inline-flex items-center gap-1">
                      <Store className="size-3.5" /> {result.storeCount}
                    </span>
                  </Row>
                )}
                {result.ratingCount > 0 && (
                  <Row label="Rating">
                    <span className="inline-flex items-center gap-1">
                      <Star className="size-3.5" /> {result.ratingAvg.toFixed(1)} (
                      {result.ratingCount})
                    </span>
                  </Row>
                )}
                {result.state === 'verified' && result.verifiedAt && (
                  <Row label="Verified on">{new Date(result.verifiedAt).toLocaleDateString()}</Row>
                )}
                {result.memberSince && (
                  <Row label={`On ${SITE.name} since`}>
                    {new Date(result.memberSince).toLocaleDateString()}
                  </Row>
                )}
              </dl>
            </>
          )}

          {/* Safety advice, not legal boilerplate. The card says who somebody
              is; it does not say what they were sent to do, and conflating the
              two is the failure mode this whole page exists to prevent. */}
          <p className="border-line/10 text-content-muted mt-1 border-t pt-4 text-xs">
            A verified card confirms who this person is not what they were sent to do. If you were
            not expecting a visit, check with whoever arranged it before letting anyone in.
          </p>

          <p className="text-content-muted text-[11px]">
            Checked {new Date(result.checkedAt).toLocaleString()} · this page is live, scan again
            any time
          </p>
        </div>
      </div>

      <p className="text-content-muted mt-5 text-center text-xs">Powered by {SITE.legalName}</p>
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
