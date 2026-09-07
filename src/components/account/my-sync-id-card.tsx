/**
 * The signed-in account's own ID card, wherever it is shown.
 *
 * WHY THE CODE IS FETCHED HERE AND NOT PASSED IN
 *   The card's address is a capability: whoever holds it can open the page.
 *   Server-rendering it into four different settings pages would put it in four
 *   more HTML payloads, four caches and four sets of logs for no gain   the
 *   holder is the only person who ever needs it and they are the one asking.
 *   One hook, one query, cached for an hour because a code changes only when
 *   somebody deliberately reissues it.
 *
 * REISSUE IS ALWAYS OFFERED
 *   "I lost my card" has to have an answer, and the answer is a new code that
 *   makes every printed copy stop resolving. It is destructive in a way that is
 *   invisible   nothing on screen changes   so the control says what it does
 *   rather than being labelled "refresh".
 *
 * THE STATE SHOWN IS THE CALLER'S TO GET RIGHT
 *   A student's status lives in student_profiles, a rider's in rider_profiles,
 *   an organiser's in profiles. Reading it here would mean this component
 *   knowing all three   so the page that already knows which kind of account it
 *   serves passes it in. The card is a renderer, not a resolver.
 */
'use client';

import { SyncIdCard, type CardKind } from './sync-id-card';
import { useMyVerificationCode, useRotateVerificationCode } from '@/modules/verification/hooks';

export function MySyncIdCard({
  kind,
  holderName,
  /** The line under the name: "Student · Computer Science", "Sync staff · Support". */
  context,
  area,
  status,
  memberSince,
  facts,
  photoUrl,
  /** Names the downloaded file. A handle or a slug; never the card code. */
  fileName,
}: {
  kind: CardKind;
  holderName: string | null;
  context?: string | null;
  area?: string | null;
  status: string;
  memberSince?: string | null;
  facts?: { label: string; value: string }[];
  /**
   * The holder's own profile picture, when they have uploaded one.
   *
   * Their picture, on their card, which they are the only person shown. This is
   * NOT the verification selfie and must never be: that lives in a private
   * bucket, a reviewer opens it and nobody else does. This is the public-media
   * upload they chose themselves (20260905150000), which is also why the public
   * /v/<code> page still shows no face   a stranger who scanned a QR is not the
   * audience for a picture put on a personal dashboard.
   */
  photoUrl?: string | null;
  fileName: string;
}) {
  const { data: code } = useMyVerificationCode();
  const rotate = useRotateVerificationCode();

  return (
    <SyncIdCard
      kind={kind}
      slug={fileName}
      code={code}
      holderName={holderName}
      category={context}
      area={area}
      logoUrl={photoUrl}
      verificationStatus={status}
      memberSince={memberSince}
      facts={facts}
      onReissue={() => rotate.mutate()}
      reissuing={rotate.isPending}
    />
  );
}
