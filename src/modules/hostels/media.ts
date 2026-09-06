/**
 * Listing media - the photos and the walkthrough video on a hostel.
 *
 * WHY THIS IS NOT `uploadVendorImage`
 *   That one targets `public-media`, which accepts image mime types at 5MB
 *   because avatars and logos are fetched on nearly every page by everybody. A
 *   walkthrough video is neither of those things, so it goes to
 *   `listing-media`: same public-read, same own-folder write rule, 40MB and
 *   video types allowed. See 20260908120000_listing_video.
 *
 * THE LIMITS HERE MIRROR THE BUCKET'S, DELIBERATELY
 *   Checking in the browser is a courtesy   the bucket is the enforcement. But
 *   an 80MB file that uploads for a minute and is then refused by storage is a
 *   minute of somebody's data and a message they cannot act on, so it is caught
 *   before it leaves.
 */
'use client';

import type { SupabaseClient } from '@supabase/supabase-js';
import { compressImage } from './compress';

export const LISTING_BUCKET = 'listing-media';

export const LISTING_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/avif'];
export const LISTING_VIDEO_TYPES = ['video/mp4', 'video/webm', 'video/quicktime'];
export const LISTING_ACCEPTED_TYPES = [...LISTING_IMAGE_TYPES, ...LISTING_VIDEO_TYPES];

/** 5MB for a photo, 40MB for a video   the bucket's own ceiling. */
export const MAX_LISTING_IMAGE_BYTES = 5 * 1024 * 1024;
export const MAX_LISTING_VIDEO_BYTES = 40 * 1024 * 1024;

export type MediaKind = 'image' | 'video';

export interface ListingMedia {
  url: string;
  kind: MediaKind;
}

export function kindOf(type: string): MediaKind | null {
  if (LISTING_IMAGE_TYPES.includes(type)) return 'image';
  if (LISTING_VIDEO_TYPES.includes(type)) return 'video';
  return null;
}

/** The message to show when a file is refused, or null when it is fine. */
export function rejectReason(file: File): string | null {
  const kind = kindOf(file.type);
  if (!kind) return `${file.name} must be a JPEG, PNG, WebP, AVIF, MP4, WebM or MOV`;

  const cap = kind === 'video' ? MAX_LISTING_VIDEO_BYTES : MAX_LISTING_IMAGE_BYTES;
  if (file.size > cap) {
    // A size and a number an agent cannot act on is a dead end. Phones record
    // at 4K by default and a 30s clip clears 40MB easily, so the message says
    // the two things that actually fix it.
    if (kind === 'video') {
      const mb = Math.round(file.size / (1024 * 1024));
      return `That video is ${mb}MB and the limit is 40MB. Record a shorter clip, or drop your camera to 1080p and try again.`;
    }
    return `${file.name} is over 5MB even after shrinking — try a different photo`;
  }
  return null;
}

/**
 * Upload one file and return its public URL and kind.
 *
 * The path starts with the uploader's uuid because `listing_media_insert_own`
 * authorizes on the first segment   a landlord can only write under their own
 * folder, so one cannot overwrite another's video.
 */
export async function uploadListingMedia(
  db: SupabaseClient,
  input: { userId: string; file: File; signal?: AbortSignal },
): Promise<ListingMedia> {
  const declaredKind = kindOf(input.file.type);
  if (!declaredKind) throw new Error(rejectReason(input.file) ?? 'Unsupported file');

  /*
   * SHRINK FIRST, THEN JUDGE THE SIZE.
   *
   * The order matters and used to be the other way round, which refused work
   * that was perfectly uploadable: phone cameras routinely produce 6-8MB JPEGs
   * and the image cap is 5MB, so an agent photographing a property with a
   * recent phone got "over 5MB" on a picture the reviewer needed. Compressing
   * before the check means that photo lands at a few hundred KB and is simply
   * accepted   and every accepted photo is now 10-20x quicker over the mobile
   * data these are actually filed on. See ./compress.
   */
  const file = declaredKind === 'image' ? await compressImage(input.file) : input.file;

  const reason = rejectReason(file);
  if (reason) throw new Error(reason);

  const kind = kindOf(file.type) as MediaKind;
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(-60);
  const token = crypto.randomUUID().slice(0, 8);
  const path = `${input.userId}/hostels/${token}-${safeName}`;

  /*
   * RETRIED, BECAUSE ONE BAR IS NOT THE SAME AS NO SIGNAL.
   *
   * A single dropped request on a weak link surfaced as "That upload failed.
   * Try again." and threw away everything already transferred. Three attempts
   * with a widening gap turns most of those into a slow success instead of an
   * agent re-picking the same photo at the gate.
   *
   * Only transport failures are retried. A refusal from storage   wrong type,
   * over the cap, no permission   returns the same answer every time, so
   * retrying it just costs more of the data we are trying to save.
   */
  let lastError: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    if (input.signal?.aborted) throw new Error('Upload cancelled');

    const { error } = await db.storage.from(LISTING_BUCKET).upload(path, file, {
      contentType: file.type,
      // A random prefix makes collisions vanishingly unlikely; an unexpected one
      // should fail rather than silently replace somebody's photo.
      upsert: false,
    });
    if (!error) {
      const { data } = db.storage.from(LISTING_BUCKET).getPublicUrl(path);
      return { url: data.publicUrl, kind };
    }

    lastError = error;
    const status = (error as { statusCode?: string | number }).statusCode;
    const permanent = status !== undefined && Number(status) >= 400 && Number(status) < 500;
    if (permanent) break;

    await new Promise((r) => setTimeout(r, 800 * 2 ** attempt));
  }

  throw lastError instanceof Error
    ? lastError
    : new Error('That upload did not go through. Check your signal and try again.');
}
