/**
 * The business-shaped view of the Sync ID card.
 *
 * WHY A WRAPPER AND NOT A SECOND CARD
 *   The card is now one component for every kind of account (sync-id-card), and
 *   a business is the one that carries extra facts nothing else has: how many
 *   stores it runs, and a logo instead of an initial. Rather than push
 *   `storeCount` into a generic component that no student will ever use, the
 *   business shape is expressed here   this file's whole job is turning "a
 *   vendor" into "a card".
 *
 *   Kept as its own name because business-profile-form has always called it
 *   that, and renaming a call site is not an improvement to anything.
 */
'use client';

import { SyncIdCard } from './sync-id-card';
import type { VerificationStatus } from '@/modules/verification/types';

export interface BusinessIdCardProps {
  businessName: string;
  /** Only used to name the downloaded file. The QR is addressed by `code`. */
  slug: string;
  code?: string | null;
  holderName?: string | null;
  category?: string | null;
  area?: string | null;
  logoUrl?: string | null;
  verificationStatus: VerificationStatus | string;
  memberSince?: string | null;
  storeCount?: number;
  onReissue?: () => void;
  reissuing?: boolean;
}

export function BusinessIdCard({ storeCount, ...rest }: BusinessIdCardProps) {
  return (
    <SyncIdCard
      kind="business"
      {...rest}
      // A count of zero is a fact worth printing   a business with no store yet
      // is a real state   so this tests for the number, not for truthiness.
      facts={typeof storeCount === 'number' ? [{ label: 'Stores', value: String(storeCount) }] : []}
    />
  );
}
